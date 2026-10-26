-- Gym Tracker — session accounting rules enforced in the database.
--
-- The only way a PT session is consumed is an attendance row whose pt_status is
-- 'completed' or 'chargeable_absence'. A trigger turns that into exactly one
-- ledger entry. Changing or deleting the attendance row voids the entry (it is
-- never deleted), so history is preserved and nothing can be counted twice.

-- ---------------------------------------------------------------------------
-- Balance helpers
-- ---------------------------------------------------------------------------
create or replace function private.package_remaining(p_package_id uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select p.sessions_purchased + coalesce((
    select sum(l.sessions)::int from public.pt_ledger l
    where l.package_id = p.id and l.voided_at is null
  ), 0)
  from public.pt_packages p
  where p.id = p_package_id;
$$;

create or replace function private.assert_non_negative(p_package_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_remaining int := private.package_remaining(p_package_id);
begin
  if v_remaining < 0 then
    raise exception 'This change would leave the package with % sessions. Renew the package or record an adjustment first.', v_remaining
      using errcode = 'P0001', hint = 'balance_negative';
  end if;
end;
$$;

-- Picks the package a session on p_date belongs to: the oldest active package
-- that has started on or before the date, has not expired (unless extensions are
-- allowed) and still has sessions left. Falls back to the newest covering one so
-- the caller can produce a helpful error.
create or replace function private.resolve_package(p_user uuid, p_date date, p_need_balance boolean)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.pt_packages p
  where p.user_id = p_user
    and p.status = 'active'
    and p.start_date <= p_date
    and (p.expiry_date is null or p_date <= p.expiry_date or p.extension_allowed)
  order by
    case when not p_need_balance or private.package_remaining(p.id) > 0 then 0 else 1 end,
    p.start_date asc,
    p.created_at asc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Attendance validation (BEFORE) and ledger sync (AFTER)
-- ---------------------------------------------------------------------------
create or replace function private.attendance_before()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pkg public.pt_packages%rowtype;
  v_consumes boolean := new.pt_status in ('completed', 'chargeable_absence');
  v_links_package boolean := new.pt_status in ('completed', 'chargeable_absence', 'missed_unconfirmed', 'trainer_cancelled', 'rescheduled');
begin
  if new.pt_status <> 'rescheduled' then
    new.rescheduled_to := null;
  end if;

  if not v_links_package then
    new.pt_package_id := null;
    return new;
  end if;

  -- Keep an explicitly chosen package; otherwise resolve one automatically.
  if new.pt_package_id is null
     or (tg_op = 'UPDATE' and new.date is distinct from old.date and new.pt_package_id = old.pt_package_id) then
    new.pt_package_id := private.resolve_package(new.user_id, new.date, v_consumes);
  end if;

  if new.pt_package_id is null then
    if v_consumes then
      raise exception 'No active PT package covers %. Add or renew a package before recording a PT session on this date.', to_char(new.date, 'DD Mon YYYY')
        using errcode = 'P0001', hint = 'no_package';
    end if;
    return new;
  end if;

  select * into v_pkg from public.pt_packages where id = new.pt_package_id and user_id = new.user_id;
  if not found then
    raise exception 'PT package not found.' using errcode = 'P0001', hint = 'no_package';
  end if;

  if v_consumes then
    if v_pkg.status = 'cancelled' then
      raise exception 'This package was cancelled; sessions cannot be recorded against it.' using errcode = 'P0001', hint = 'package_cancelled';
    end if;
    if new.date < v_pkg.start_date then
      raise exception 'The package starts on %. Sessions cannot be deducted before a package becomes active.', to_char(v_pkg.start_date, 'DD Mon YYYY')
        using errcode = 'P0001', hint = 'package_not_started';
    end if;
    if v_pkg.expiry_date is not null and new.date > v_pkg.expiry_date and not v_pkg.extension_allowed then
      raise exception 'The package expired on %. Allow an expiry extension on the package to record this session.', to_char(v_pkg.expiry_date, 'DD Mon YYYY')
        using errcode = 'P0001', hint = 'package_expired';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.attendance_sync_ledger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_active public.pt_ledger%rowtype;
begin
  if tg_op = 'DELETE' then
    update public.pt_ledger
       set voided_at = now(),
           void_reason = format('Attendance record for %s was deleted', to_char(old.date, 'DD Mon YYYY'))
     where attendance_id = old.id and voided_at is null;
    return old;
  end if;

  v_kind := case new.pt_status when 'completed' then 'completed' when 'chargeable_absence' then 'forfeited' end;

  select * into v_active from public.pt_ledger
   where attendance_id = new.id and voided_at is null
   for update;

  if found and (v_kind is null
                or v_active.kind <> v_kind
                or v_active.package_id <> new.pt_package_id
                or v_active.session_date <> new.date) then
    update public.pt_ledger
       set voided_at = now(),
           void_reason = format('Attendance on %s changed: PT %s → %s',
                                to_char(new.date, 'DD Mon YYYY'),
                                coalesce(case when tg_op = 'UPDATE' then old.pt_status end, v_active.kind),
                                new.pt_status)
     where id = v_active.id;
    v_active := null;
  end if;

  if v_kind is not null and v_active.id is null then
    insert into public.pt_ledger (user_id, package_id, kind, sessions, session_date, attendance_id, note)
    values (new.user_id, new.pt_package_id, v_kind, -1, new.date, new.id,
            case v_kind when 'completed' then 'PT session completed' else 'Confirmed chargeable PT absence' end);
    perform private.assert_non_negative(new.pt_package_id);
  end if;

  return new;
end;
$$;

create trigger attendance_validate
  before insert or update on public.attendance
  for each row execute function private.attendance_before();

create trigger attendance_ledger_sync
  after insert or update on public.attendance
  for each row execute function private.attendance_sync_ledger();

create trigger attendance_ledger_void_on_delete
  before delete on public.attendance
  for each row execute function private.attendance_sync_ledger();

-- ---------------------------------------------------------------------------
-- Package protection: historical prices are never rewritten once used.
-- ---------------------------------------------------------------------------
create or replace function private.pt_packages_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_used boolean;
begin
  select exists (select 1 from public.pt_ledger where package_id = old.id and voided_at is null) into v_used;

  if v_used and (new.price_paise <> old.price_paise or new.sessions_purchased <> old.sessions_purchased) then
    raise exception 'Price and session count are locked because sessions have already been recorded against this package. Record a credit, refund or adjustment instead.'
      using errcode = 'P0001', hint = 'package_locked';
  end if;

  if new.start_date > old.start_date and exists (
       select 1 from public.pt_ledger
        where package_id = old.id and voided_at is null and session_date < new.start_date) then
    raise exception 'Sessions are already recorded before %; the start date cannot move past them.', to_char(new.start_date, 'DD Mon YYYY')
      using errcode = 'P0001', hint = 'package_locked';
  end if;

  if new.sessions_purchased <> old.sessions_purchased then
    perform private.assert_non_negative(new.id);
  end if;
  return new;
end;
$$;

create trigger pt_packages_guard
  before update on public.pt_packages
  for each row execute function private.pt_packages_guard();

-- Re-check balance after the update so sessions_purchased reductions are validated.
create or replace function private.pt_packages_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_non_negative(new.id);
  return null;
end;
$$;

create trigger pt_packages_balance_check
  after update of sessions_purchased on public.pt_packages
  for each row execute function private.pt_packages_after_update();

-- ---------------------------------------------------------------------------
-- RPC: manual session movements (credit / refund / adjustment)
-- ---------------------------------------------------------------------------
create or replace function public.record_session_adjustment(
  p_package_id uuid,
  p_kind text,
  p_sessions int,
  p_note text default null,
  p_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_delta int;
begin
  if v_uid is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.pt_packages where id = p_package_id and user_id = v_uid) then
    raise exception 'PT package not found.' using errcode = 'P0001';
  end if;
  if p_kind not in ('credit', 'refund', 'adjustment') then
    raise exception 'Only credits, refunds and adjustments can be recorded manually. Completed and missed sessions come from attendance.' using errcode = 'P0001';
  end if;
  if p_sessions is null or p_sessions = 0 or abs(p_sessions) > 1000 then
    raise exception 'Enter a non-zero number of sessions.' using errcode = 'P0001';
  end if;

  v_delta := case p_kind when 'credit' then abs(p_sessions) when 'refund' then -abs(p_sessions) else p_sessions end;

  if p_kind = 'adjustment' and nullif(btrim(coalesce(p_note, '')), '') is null then
    raise exception 'Adjustments need a note explaining the reason.' using errcode = 'P0001';
  end if;

  insert into public.pt_ledger (user_id, package_id, kind, sessions, session_date, note)
  values (v_uid, p_package_id, p_kind, v_delta, p_date, nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_id;

  perform private.assert_non_negative(p_package_id);
  return v_id;
end;
$$;

create or replace function public.void_session_adjustment(p_entry_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_entry public.pt_ledger%rowtype;
begin
  if v_uid is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  select * into v_entry from public.pt_ledger where id = p_entry_id and user_id = v_uid for update;
  if not found then
    raise exception 'Ledger entry not found.' using errcode = 'P0001';
  end if;
  if v_entry.voided_at is not null then
    return; -- already voided; idempotent
  end if;
  if v_entry.kind in ('completed', 'forfeited') then
    raise exception 'Session entries come from attendance. Correct the attendance record for % instead.', to_char(v_entry.session_date, 'DD Mon YYYY')
      using errcode = 'P0001';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Give a reason for voiding this entry.' using errcode = 'P0001';
  end if;

  if v_entry.kind in ('transfer_in', 'transfer_out') then
    -- Void both halves of a rollover together.
    update public.pt_ledger
       set voided_at = now(), void_reason = btrim(p_reason)
     where user_id = v_uid and voided_at is null
       and kind in ('transfer_in', 'transfer_out')
       and note = v_entry.note and created_at = v_entry.created_at;
  else
    update public.pt_ledger set voided_at = now(), void_reason = btrim(p_reason) where id = p_entry_id;
  end if;

  perform private.assert_non_negative(v_entry.package_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: close a package and decide what happens to unused sessions.
-- Nothing happens to unused sessions unless the user picks a treatment.
-- ---------------------------------------------------------------------------
create or replace function public.close_package(
  p_package_id uuid,
  p_closed_on date,
  p_treatment text,
  p_target_package_id uuid default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_pkg public.pt_packages%rowtype;
  v_remaining int;
  v_note text;
begin
  if v_uid is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  select * into v_pkg from public.pt_packages where id = p_package_id and user_id = v_uid for update;
  if not found then
    raise exception 'PT package not found.' using errcode = 'P0001';
  end if;
  if v_pkg.status <> 'active' then
    raise exception 'This package is already %.', v_pkg.status using errcode = 'P0001';
  end if;
  if p_treatment not in ('still_usable', 'rolled_over', 'forfeited', 'refunded', 'undecided') then
    raise exception 'Unknown treatment for unused sessions.' using errcode = 'P0001';
  end if;

  v_remaining := private.package_remaining(p_package_id);

  if v_remaining > 0 and p_treatment = 'rolled_over' then
    if p_target_package_id is null or p_target_package_id = p_package_id
       or not exists (select 1 from public.pt_packages where id = p_target_package_id and user_id = v_uid and status = 'active') then
      raise exception 'Choose the active package that should receive the unused sessions.' using errcode = 'P0001';
    end if;
    v_note := format('Rollover of %s unused session(s) on %s', v_remaining, to_char(p_closed_on, 'DD Mon YYYY'));
    insert into public.pt_ledger (user_id, package_id, kind, sessions, session_date, note)
    values (v_uid, p_package_id, 'transfer_out', -v_remaining, p_closed_on, v_note),
           (v_uid, p_target_package_id, 'transfer_in', v_remaining, p_closed_on, v_note);
  elsif v_remaining > 0 and p_treatment = 'forfeited' then
    insert into public.pt_ledger (user_id, package_id, kind, sessions, session_date, note)
    values (v_uid, p_package_id, 'expired', -v_remaining, p_closed_on,
            coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Unused sessions forfeited at closure'));
  elsif v_remaining > 0 and p_treatment = 'refunded' then
    insert into public.pt_ledger (user_id, package_id, kind, sessions, session_date, note)
    values (v_uid, p_package_id, 'refund', -v_remaining, p_closed_on,
            coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Unused sessions refunded at closure'));
  end if;

  -- 'still_usable' keeps the package active (sessions may still be used later).
  if p_treatment = 'still_usable' and v_remaining > 0 then
    update public.pt_packages set unused_sessions_treatment = 'still_usable' where id = p_package_id;
    return;
  end if;

  update public.pt_packages
     set status = case when v_remaining <= 0 or p_treatment in ('rolled_over', 'forfeited', 'refunded') then 'completed' else 'closed' end,
         closed_on = p_closed_on,
         unused_sessions_treatment = case when v_remaining > 0 then p_treatment else 'undecided' end
   where id = p_package_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: create (or renew) a package atomically, with its trainer and payments.
-- ---------------------------------------------------------------------------
create or replace function public.create_package(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_trainer uuid;
  v_pkg uuid;
  v_pay jsonb;
  v_days smallint[];
begin
  if v_uid is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;

  v_trainer := nullif(p ->> 'trainer_id', '')::uuid;
  if v_trainer is null then
    if nullif(btrim(coalesce(p ->> 'trainer_name', '')), '') is null then
      raise exception 'Trainer name is required.' using errcode = 'P0001';
    end if;
    select id into v_trainer from public.trainers
     where user_id = v_uid and lower(btrim(name)) = lower(btrim(p ->> 'trainer_name'));
    if v_trainer is null then
      insert into public.trainers (user_id, name) values (v_uid, btrim(p ->> 'trainer_name')) returning id into v_trainer;
    end if;
  end if;

  select coalesce(array_agg(distinct (d)::smallint order by (d)::smallint), '{1,2,3,4,5,6}')
    into v_days
    from jsonb_array_elements_text(coalesce(p -> 'schedule_days', '[1,2,3,4,5,6]'::jsonb)) d;

  insert into public.pt_packages (
    user_id, trainer_id, label, price_paise, sessions_purchased, purchased_on, start_date, expiry_date,
    schedule_days, exclude_sundays, sessions_per_week, rollover_allowed, pausable, extension_allowed,
    renewed_from_id, notes)
  values (
    v_uid, v_trainer, nullif(p ->> 'label', ''), (p ->> 'price_paise')::bigint, (p ->> 'sessions_purchased')::int,
    nullif(p ->> 'purchased_on', '')::date, (p ->> 'start_date')::date, nullif(p ->> 'expiry_date', '')::date,
    v_days, coalesce((p ->> 'exclude_sundays')::boolean, true), nullif(p ->> 'sessions_per_week', '')::int,
    coalesce((p ->> 'rollover_allowed')::boolean, false), coalesce((p ->> 'pausable')::boolean, false),
    coalesce((p ->> 'extension_allowed')::boolean, false), nullif(p ->> 'renewed_from_id', '')::uuid,
    nullif(p ->> 'notes', ''))
  returning id into v_pkg;

  for v_pay in select * from jsonb_array_elements(coalesce(p -> 'payments', '[]'::jsonb)) loop
    insert into public.pt_payments (user_id, package_id, kind, amount_paise, status, paid_on, due_on, method, note)
    values (v_uid, v_pkg, 'payment', (v_pay ->> 'amount_paise')::bigint, coalesce(v_pay ->> 'status', 'paid'),
            nullif(v_pay ->> 'paid_on', '')::date, nullif(v_pay ->> 'due_on', '')::date,
            nullif(v_pay ->> 'method', ''), nullif(v_pay ->> 'note', ''));
  end loop;

  return v_pkg;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: save a workout with its exercises and sets in one transaction.
-- Runs with the caller's privileges, so RLS applies to every row.
-- ---------------------------------------------------------------------------
create or replace function public.save_workout(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_ex jsonb;
  v_set jsonb;
  v_we uuid;
  v_exercise uuid;
  v_pos int := 0;
  v_setno int;
begin
  if v_uid is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  if nullif(p ->> 'workout_date', '') is null then
    raise exception 'Workout date is required.' using errcode = 'P0001';
  end if;

  if v_id is null then
    insert into public.workouts (user_id, workout_date) values (v_uid, (p ->> 'workout_date')::date) returning id into v_id;
  elsif not exists (select 1 from public.workouts where id = v_id and user_id = v_uid) then
    raise exception 'Workout not found.' using errcode = 'P0001';
  end if;

  update public.workouts set
    workout_date     = (p ->> 'workout_date')::date,
    start_time       = nullif(p ->> 'start_time', '')::time,
    title            = nullif(btrim(coalesce(p ->> 'title', '')), ''),
    workout_type     = nullif(p ->> 'workout_type', ''),
    muscle_groups    = coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p -> 'muscle_groups', '[]'::jsonb)) x), '{}'),
    duration_min     = nullif(p ->> 'duration_min', '')::int,
    cardio_type      = nullif(p ->> 'cardio_type', ''),
    cardio_min       = nullif(p ->> 'cardio_min', '')::int,
    distance_km      = nullif(p ->> 'distance_km', '')::numeric,
    energy_level     = nullif(p ->> 'energy_level', '')::smallint,
    with_trainer     = coalesce((p ->> 'with_trainer')::boolean, false),
    trainer_notes    = nullif(p ->> 'trainer_notes', ''),
    personal_notes   = nullif(p ->> 'personal_notes', ''),
    discomfort_notes = nullif(p ->> 'discomfort_notes', '')
  where id = v_id;

  delete from public.workout_exercises where workout_id = v_id;

  for v_ex in select * from jsonb_array_elements(coalesce(p -> 'exercises', '[]'::jsonb)) loop
    v_exercise := nullif(v_ex ->> 'exercise_id', '')::uuid;
    if v_exercise is null then
      if nullif(btrim(coalesce(v_ex ->> 'name', '')), '') is null then
        continue;
      end if;
      select id into v_exercise from public.exercises
       where user_id = v_uid and lower(btrim(name)) = lower(btrim(v_ex ->> 'name'));
      if v_exercise is null then
        insert into public.exercises (user_id, name, primary_muscle, category)
        values (v_uid, btrim(v_ex ->> 'name'), coalesce(nullif(v_ex ->> 'primary_muscle', ''), 'other'),
                coalesce(nullif(v_ex ->> 'category', ''), 'strength'))
        returning id into v_exercise;
      end if;
    end if;

    insert into public.workout_exercises (user_id, workout_id, exercise_id, position, rest_seconds, notes)
    values (v_uid, v_id, v_exercise, v_pos, nullif(v_ex ->> 'rest_seconds', '')::int, nullif(v_ex ->> 'notes', ''))
    returning id into v_we;
    v_pos := v_pos + 1;

    v_setno := 0;
    for v_set in select * from jsonb_array_elements(coalesce(v_ex -> 'sets', '[]'::jsonb)) loop
      if nullif(v_set ->> 'reps', '') is null and nullif(v_set ->> 'weight_kg', '') is null
         and nullif(v_set ->> 'duration_sec', '') is null then
        continue;
      end if;
      v_setno := v_setno + 1;
      insert into public.workout_sets (user_id, workout_exercise_id, set_number, reps, weight_kg, duration_sec, is_warmup)
      values (v_uid, v_we, v_setno, nullif(v_set ->> 'reps', '')::int, nullif(v_set ->> 'weight_kg', '')::numeric,
              nullif(v_set ->> 'duration_sec', '')::int, coalesce((v_set ->> 'is_warmup')::boolean, false));
    end loop;
  end loop;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.record_session_adjustment(uuid, text, int, text, date) from public, anon;
revoke execute on function public.void_session_adjustment(uuid, text) from public, anon;
revoke execute on function public.close_package(uuid, date, text, uuid, text) from public, anon;
revoke execute on function public.create_package(jsonb) from public, anon;
revoke execute on function public.save_workout(jsonb) from public, anon;
grant execute on function public.record_session_adjustment(uuid, text, int, text, date) to authenticated;
grant execute on function public.void_session_adjustment(uuid, text) to authenticated;
grant execute on function public.close_package(uuid, date, text, uuid, text) to authenticated;
grant execute on function public.create_package(jsonb) to authenticated;
grant execute on function public.save_workout(jsonb) to authenticated;
