-- Gym Tracker — reporting view, account initialisation, archive restore, storage.

-- ---------------------------------------------------------------------------
-- package_summary: every balance is derived from the ledger, payments and
-- attendance. Nothing here is a stored counter. RLS of the caller applies.
-- ---------------------------------------------------------------------------
create or replace view public.package_summary
with (security_invoker = true) as
select
  p.id,
  p.user_id,
  p.trainer_id,
  t.name                                    as trainer_name,
  p.label,
  p.price_paise,
  p.sessions_purchased,
  p.purchased_on,
  p.start_date,
  p.expiry_date,
  p.schedule_days,
  p.exclude_sundays,
  p.sessions_per_week,
  p.rollover_allowed,
  p.pausable,
  p.extension_allowed,
  p.status,
  p.closed_on,
  p.unused_sessions_treatment,
  p.renewed_from_id,
  p.notes,
  p.created_at,
  coalesce(l.completed, 0)::int             as completed,
  coalesce(l.forfeited, 0)::int             as forfeited,
  coalesce(l.credited, 0)::int              as credited,
  coalesce(l.refunded, 0)::int              as refunded,
  coalesce(l.expired, 0)::int               as expired,
  coalesce(l.transferred_in, 0)::int        as transferred_in,
  coalesce(l.transferred_out, 0)::int       as transferred_out,
  coalesce(l.adjusted, 0)::int              as adjusted,
  (p.sessions_purchased + coalesce(l.net, 0))::int as remaining,
  l.last_session_date,
  coalesce(a.trainer_cancelled, 0)::int     as trainer_cancelled,
  coalesce(a.rescheduled, 0)::int           as rescheduled,
  coalesce(a.missed_unconfirmed, 0)::int    as missed_unconfirmed,
  coalesce(pay.paid, 0)::bigint             as paid_paise,
  coalesce(pay.refunded, 0)::bigint         as refunded_paise,
  coalesce(pay.pending, 0)::bigint          as pending_paise,
  greatest(p.price_paise - coalesce(pay.paid, 0), 0)::bigint as outstanding_paise
from public.pt_packages p
join public.trainers t on t.id = p.trainer_id
left join lateral (
  select
    count(*) filter (where kind = 'completed')                       as completed,
    count(*) filter (where kind = 'forfeited')                       as forfeited,
    sum(sessions) filter (where kind = 'credit')                     as credited,
    -sum(sessions) filter (where kind = 'refund')                    as refunded,
    -sum(sessions) filter (where kind = 'expired')                   as expired,
    sum(sessions) filter (where kind = 'transfer_in')                as transferred_in,
    -sum(sessions) filter (where kind = 'transfer_out')              as transferred_out,
    sum(sessions) filter (where kind = 'adjustment')                 as adjusted,
    sum(sessions)                                                    as net,
    max(session_date) filter (where kind in ('completed', 'forfeited')) as last_session_date
  from public.pt_ledger
  where package_id = p.id and voided_at is null
) l on true
left join lateral (
  select
    count(*) filter (where pt_status = 'trainer_cancelled')  as trainer_cancelled,
    count(*) filter (where pt_status = 'rescheduled')        as rescheduled,
    count(*) filter (where pt_status = 'missed_unconfirmed') as missed_unconfirmed
  from public.attendance
  where pt_package_id = p.id
) a on true
left join lateral (
  select
    sum(amount_paise) filter (where kind = 'payment' and status = 'paid')    as paid,
    sum(amount_paise) filter (where kind = 'refund' and status = 'paid')     as refunded,
    sum(amount_paise) filter (where kind = 'payment' and status = 'pending') as pending
  from public.pt_payments
  where package_id = p.id
) pay on true;

grant select on public.package_summary to authenticated;
revoke all on public.package_summary from anon;

-- ---------------------------------------------------------------------------
-- Default exercise library and workout templates (reference data, not history)
-- ---------------------------------------------------------------------------
create or replace function private.ensure_defaults(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.exercises (user_id, name, primary_muscle, secondary_muscles, category, equipment)
  select p_uid, e.name, e.primary_muscle, e.secondary, e.category, e.equipment
  from (values
    ('Bench Press', 'chest', array['triceps', 'shoulders'], 'strength', 'barbell'),
    ('Incline Bench Press', 'chest', array['shoulders', 'triceps'], 'strength', 'barbell'),
    ('Dumbbell Bench Press', 'chest', array['triceps', 'shoulders'], 'strength', 'dumbbell'),
    ('Incline Dumbbell Press', 'chest', array['shoulders', 'triceps'], 'strength', 'dumbbell'),
    ('Cable Fly', 'chest', array[]::text[], 'strength', 'cable'),
    ('Pec Deck', 'chest', array[]::text[], 'strength', 'machine'),
    ('Chest Press Machine', 'chest', array['triceps'], 'strength', 'machine'),
    ('Push-up', 'chest', array['triceps', 'shoulders', 'core'], 'strength', 'bodyweight'),
    ('Chest Dip', 'chest', array['triceps'], 'strength', 'bodyweight'),
    ('Deadlift', 'back', array['hamstrings', 'glutes', 'core'], 'strength', 'barbell'),
    ('Lat Pulldown', 'back', array['biceps'], 'strength', 'cable'),
    ('Pull-up', 'back', array['biceps'], 'strength', 'bodyweight'),
    ('Seated Cable Row', 'back', array['biceps'], 'strength', 'cable'),
    ('Barbell Row', 'back', array['biceps'], 'strength', 'barbell'),
    ('Dumbbell Row', 'back', array['biceps'], 'strength', 'dumbbell'),
    ('T-Bar Row', 'back', array['biceps'], 'strength', 'machine'),
    ('Shrug', 'back', array[]::text[], 'strength', 'dumbbell'),
    ('Overhead Press', 'shoulders', array['triceps'], 'strength', 'barbell'),
    ('Dumbbell Shoulder Press', 'shoulders', array['triceps'], 'strength', 'dumbbell'),
    ('Lateral Raise', 'shoulders', array[]::text[], 'strength', 'dumbbell'),
    ('Front Raise', 'shoulders', array[]::text[], 'strength', 'dumbbell'),
    ('Rear Delt Fly', 'shoulders', array['back'], 'strength', 'dumbbell'),
    ('Face Pull', 'shoulders', array['back'], 'strength', 'cable'),
    ('Barbell Curl', 'biceps', array['forearms'], 'strength', 'barbell'),
    ('Dumbbell Curl', 'biceps', array['forearms'], 'strength', 'dumbbell'),
    ('Hammer Curl', 'biceps', array['forearms'], 'strength', 'dumbbell'),
    ('Preacher Curl', 'biceps', array[]::text[], 'strength', 'machine'),
    ('Triceps Pushdown', 'triceps', array[]::text[], 'strength', 'cable'),
    ('Overhead Triceps Extension', 'triceps', array[]::text[], 'strength', 'cable'),
    ('Skull Crusher', 'triceps', array[]::text[], 'strength', 'barbell'),
    ('Close-Grip Bench Press', 'triceps', array['chest'], 'strength', 'barbell'),
    ('Squat', 'quads', array['glutes', 'hamstrings', 'core'], 'strength', 'barbell'),
    ('Leg Press', 'quads', array['glutes'], 'strength', 'machine'),
    ('Romanian Deadlift', 'hamstrings', array['glutes', 'back'], 'strength', 'barbell'),
    ('Leg Extension', 'quads', array[]::text[], 'strength', 'machine'),
    ('Leg Curl', 'hamstrings', array[]::text[], 'strength', 'machine'),
    ('Walking Lunge', 'quads', array['glutes'], 'strength', 'dumbbell'),
    ('Bulgarian Split Squat', 'quads', array['glutes'], 'strength', 'dumbbell'),
    ('Hip Thrust', 'glutes', array['hamstrings'], 'strength', 'barbell'),
    ('Calf Raise', 'calves', array[]::text[], 'strength', 'machine'),
    ('Plank', 'core', array[]::text[], 'strength', 'bodyweight'),
    ('Hanging Leg Raise', 'core', array[]::text[], 'strength', 'bodyweight'),
    ('Cable Crunch', 'core', array[]::text[], 'strength', 'cable'),
    ('Russian Twist', 'core', array[]::text[], 'strength', 'bodyweight'),
    ('Treadmill', 'cardio', array[]::text[], 'cardio', 'machine'),
    ('Cycling', 'cardio', array[]::text[], 'cardio', 'machine'),
    ('Rowing Machine', 'cardio', array['back'], 'cardio', 'machine'),
    ('Elliptical', 'cardio', array[]::text[], 'cardio', 'machine'),
    ('Stair Climber', 'cardio', array[]::text[], 'cardio', 'machine'),
    ('Jump Rope', 'cardio', array[]::text[], 'cardio', 'other')
  ) as e(name, primary_muscle, secondary, category, equipment)
  on conflict do nothing;

  insert into public.workout_templates (user_id, name, workout_type, muscle_groups, exercise_names, is_builtin)
  select p_uid, t.name, t.wtype, t.muscles, t.exercises, true
  from (values
    ('Push', 'push', array['chest', 'shoulders', 'triceps'], array['Bench Press', 'Overhead Press', 'Incline Dumbbell Press', 'Lateral Raise', 'Triceps Pushdown']),
    ('Pull', 'pull', array['back', 'biceps'], array['Deadlift', 'Lat Pulldown', 'Seated Cable Row', 'Face Pull', 'Barbell Curl']),
    ('Legs', 'legs', array['quads', 'hamstrings', 'glutes', 'calves'], array['Squat', 'Romanian Deadlift', 'Leg Press', 'Leg Curl', 'Calf Raise']),
    ('Chest & Triceps', 'chest_triceps', array['chest', 'triceps'], array['Bench Press', 'Incline Dumbbell Press', 'Cable Fly', 'Triceps Pushdown', 'Overhead Triceps Extension']),
    ('Back & Biceps', 'back_biceps', array['back', 'biceps'], array['Lat Pulldown', 'Barbell Row', 'Seated Cable Row', 'Barbell Curl', 'Hammer Curl']),
    ('Shoulders', 'shoulders', array['shoulders'], array['Overhead Press', 'Lateral Raise', 'Rear Delt Fly', 'Front Raise', 'Shrug']),
    ('Full Body', 'full_body', array['chest', 'back', 'quads', 'shoulders', 'core'], array['Squat', 'Bench Press', 'Barbell Row', 'Overhead Press', 'Plank']),
    ('Cardio', 'cardio', array['cardio'], array['Treadmill', 'Cycling', 'Rowing Machine'])
  ) as t(name, wtype, muscles, exercises)
  on conflict do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- initialize_account(): safe to call on every sign-in.
--   * every account gets a profile, the exercise library and templates;
--   * only the configured owner account receives the personal seed
--     (19Fitness membership, Soham's package, confirmed gym absences);
--   * profiles.seeded_at makes it run once; natural-key conflicts make even a
--     concurrent or repeated run harmless.
-- ---------------------------------------------------------------------------
create or replace function public.initialize_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_email   text;
  v_owner   text;
  v_profile public.profiles%rowtype;
  v_trainer uuid;
begin
  if v_uid is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;

  insert into public.profiles (id) values (v_uid) on conflict (id) do nothing;
  select * into v_profile from public.profiles where id = v_uid for update;

  if v_profile.seeded_at is not null then
    return jsonb_build_object('seeded', false, 'reason', 'already_initialized');
  end if;

  perform private.ensure_defaults(v_uid);

  select lower(email) into v_email from auth.users where id = v_uid;
  select lower(btrim(value)) into v_owner from private.app_config where key = 'owner_email';

  if v_owner is null or v_email is distinct from v_owner then
    update public.profiles set seeded_at = now() where id = v_uid;
    return jsonb_build_object('seeded', false, 'reason', 'not_owner');
  end if;

  -- Gym membership: estimated end date is generated; confirmed end date left empty.
  insert into public.memberships (user_id, gym_name, start_date, duration_months, price_paise,
                                  price_is_approximate, payment_status, notes)
  values (v_uid, '19Fitness', date '2026-09-29', 3, 500000, true, 'unconfirmed',
          'From initial setup: price is approximate (about ₹5,000). Confirm the contractual expiry date and whether it was paid.')
  on conflict (user_id, gym_name, start_date) do nothing;

  insert into public.trainers (user_id, name) values (v_uid, 'Soham') on conflict do nothing;
  select id into v_trainer from public.trainers where user_id = v_uid and lower(btrim(name)) = 'soham';

  if not exists (select 1 from public.pt_packages where user_id = v_uid and trainer_id = v_trainer and start_date = date '2026-09-29') then
    insert into public.pt_packages (user_id, trainer_id, label, price_paise, sessions_purchased, purchased_on,
                                    start_date, expiry_date, schedule_days, exclude_sundays, sessions_per_week, notes)
    values (v_uid, v_trainer, 'Original package', 600000, 30, null, date '2026-09-29', null,
            '{1,2,3,4,5,6}', true, 6,
            'From initial setup. Payment not yet recorded — add it under PT Packages once confirmed.');
  end if;

  -- Confirmed gym absences. PT outcome stays unverified (Sundays: no PT scheduled).
  insert into public.attendance (user_id, date, gym_status, pt_status, notes, source)
  select v_uid, d, 'absent',
         case when extract(isodow from d) = 7 then 'not_scheduled' else 'unverified' end,
         case when extract(isodow from d) = 7
              then 'Confirmed gym absence. Sunday — no PT session under the default Monday–Saturday schedule.'
              else 'Confirmed gym absence. Whether a PT session was scheduled and charged has not been confirmed.' end,
         'seed'
  from unnest(array['2026-10-01', '2026-10-03', '2026-10-11', '2026-10-12', '2026-10-13',
                    '2026-10-15', '2026-10-17', '2026-10-19', '2026-10-23', '2026-10-24']::date[]) as d
  on conflict (user_id, date) do nothing;

  update public.profiles
     set seeded_at = now(),
         tracking_start_date = coalesce(tracking_start_date, date '2026-09-29')
   where id = v_uid;

  return jsonb_build_object('seeded', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- restore_archive(): insert-only restore of a JSON export into the caller's
-- account. Existing rows are never overwritten; rows that already exist (same
-- id or same natural key) are skipped, so restoring twice creates nothing new.
-- Completed/forfeited ledger entries are re-derived from attendance; voided
-- entries and audit history are not restored.
-- ---------------------------------------------------------------------------
create or replace function public.restore_archive(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  t jsonb := p -> 'tables';
  n int;
  result jsonb := '{}'::jsonb;
begin
  if v_uid is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  if coalesce(p ->> 'format', '') <> 'gym-tracker-archive' or (p ->> 'version')::int <> 1 or t is null then
    raise exception 'This file is not a Gym Tracker archive (format v1).' using errcode = 'P0001';
  end if;

  create temp table if not exists _restore_map (kind text, old_id uuid, new_id uuid) on commit drop;
  delete from _restore_map;

  -- Settings
  update public.profiles pr set
    display_name = coalesce(r.display_name, pr.display_name),
    timezone = coalesce(r.timezone, pr.timezone),
    currency = coalesce(r.currency, pr.currency),
    weekly_workout_goal = coalesce(r.weekly_workout_goal, pr.weekly_workout_goal),
    renewal_warning_days = coalesce(r.renewal_warning_days, pr.renewal_warning_days),
    tracking_start_date = coalesce(pr.tracking_start_date, r.tracking_start_date)
  from jsonb_to_recordset(coalesce(t -> 'profiles', '[]')) as r(display_name text, timezone text, currency text,
       weekly_workout_goal int, renewal_warning_days int, tracking_start_date date)
  where pr.id = v_uid;

  -- Memberships
  insert into public.memberships (id, user_id, gym_name, start_date, duration_months, confirmed_end_date, price_paise,
                                  price_is_approximate, payment_status, paid_on, notes, created_at)
  select r.id, v_uid, r.gym_name, r.start_date, r.duration_months, r.confirmed_end_date, r.price_paise,
         coalesce(r.price_is_approximate, false), coalesce(r.payment_status, 'unconfirmed'), r.paid_on, r.notes, coalesce(r.created_at, now())
  from jsonb_to_recordset(coalesce(t -> 'memberships', '[]')) as r(id uuid, gym_name text, start_date date, duration_months int,
       confirmed_end_date date, price_paise bigint, price_is_approximate boolean, payment_status text, paid_on date, notes text, created_at timestamptz)
  on conflict do nothing;
  get diagnostics n = row_count; result := result || jsonb_build_object('memberships', n);

  -- Trainers (matched by name)
  insert into public.trainers (id, user_id, name, phone, notes, is_active, created_at)
  select r.id, v_uid, r.name, r.phone, r.notes, coalesce(r.is_active, true), coalesce(r.created_at, now())
  from jsonb_to_recordset(coalesce(t -> 'trainers', '[]')) as r(id uuid, name text, phone text, notes text, is_active boolean, created_at timestamptz)
  on conflict do nothing;
  get diagnostics n = row_count; result := result || jsonb_build_object('trainers', n);
  insert into _restore_map
  select 'trainer', r.id, tr.id
  from jsonb_to_recordset(coalesce(t -> 'trainers', '[]')) as r(id uuid, name text)
  join public.trainers tr on tr.user_id = v_uid and lower(btrim(tr.name)) = lower(btrim(r.name));

  -- Packages
  insert into public.pt_packages (id, user_id, trainer_id, label, price_paise, sessions_purchased, purchased_on, start_date,
         expiry_date, schedule_days, exclude_sundays, sessions_per_week, rollover_allowed, pausable, extension_allowed,
         status, closed_on, unused_sessions_treatment, notes, created_at)
  select r.id, v_uid, m.new_id, r.label, r.price_paise, r.sessions_purchased, r.purchased_on, r.start_date,
         r.expiry_date, coalesce(r.schedule_days, '{1,2,3,4,5,6}'), coalesce(r.exclude_sundays, true), r.sessions_per_week,
         coalesce(r.rollover_allowed, false), coalesce(r.pausable, false), coalesce(r.extension_allowed, false),
         coalesce(r.status, 'active'), r.closed_on, coalesce(r.unused_sessions_treatment, 'undecided'), r.notes, coalesce(r.created_at, now())
  from jsonb_to_recordset(coalesce(t -> 'pt_packages', '[]')) as r(id uuid, trainer_id uuid, label text, price_paise bigint,
       sessions_purchased int, purchased_on date, start_date date, expiry_date date, schedule_days smallint[], exclude_sundays boolean,
       sessions_per_week int, rollover_allowed boolean, pausable boolean, extension_allowed boolean, status text, closed_on date,
       unused_sessions_treatment text, notes text, created_at timestamptz)
  join _restore_map m on m.kind = 'trainer' and m.old_id = r.trainer_id
  order by r.start_date
  on conflict do nothing;
  get diagnostics n = row_count; result := result || jsonb_build_object('pt_packages', n);
  insert into _restore_map
  select 'package', p2.id, p2.id from public.pt_packages p2
  where p2.user_id = v_uid and p2.id in (select (x ->> 'id')::uuid from jsonb_array_elements(coalesce(t -> 'pt_packages', '[]')) x);
  update public.pt_packages p3 set renewed_from_id = r.renewed_from_id
  from jsonb_to_recordset(coalesce(t -> 'pt_packages', '[]')) as r(id uuid, renewed_from_id uuid)
  join _restore_map m on m.kind = 'package' and m.old_id = r.renewed_from_id
  where p3.id = r.id and p3.user_id = v_uid and p3.renewed_from_id is null and r.renewed_from_id is not null;

  -- Payments
  insert into public.pt_payments (id, user_id, package_id, kind, amount_paise, status, paid_on, due_on, method, note, created_at)
  select r.id, v_uid, m.new_id, coalesce(r.kind, 'payment'), r.amount_paise, coalesce(r.status, 'paid'), r.paid_on, r.due_on, r.method, r.note,
         coalesce(r.created_at, now())
  from jsonb_to_recordset(coalesce(t -> 'pt_payments', '[]')) as r(id uuid, package_id uuid, kind text, amount_paise bigint, status text,
       paid_on date, due_on date, method text, note text, created_at timestamptz)
  join _restore_map m on m.kind = 'package' and m.old_id = r.package_id
  on conflict do nothing;
  get diagnostics n = row_count; result := result || jsonb_build_object('pt_payments', n);

  -- Positive manual ledger entries first so balances never dip below zero mid-restore.
  insert into public.pt_ledger (id, user_id, package_id, kind, sessions, session_date, note, created_at)
  select r.id, v_uid, m.new_id, r.kind, r.sessions, r.session_date, r.note, coalesce(r.created_at, now())
  from jsonb_to_recordset(coalesce(t -> 'pt_ledger', '[]')) as r(id uuid, package_id uuid, kind text, sessions int, session_date date,
       note text, voided_at timestamptz, created_at timestamptz)
  join _restore_map m on m.kind = 'package' and m.old_id = r.package_id
  where r.voided_at is null and r.kind in ('credit', 'transfer_in', 'adjustment') and r.sessions > 0
  on conflict do nothing;
  get diagnostics n = row_count; result := result || jsonb_build_object('ledger_positive', n);

  -- Attendance (the ledger trigger re-creates completed / forfeited entries)
  insert into public.attendance (id, user_id, date, gym_status, pt_status, pt_package_id, rescheduled_to, absence_reason, notes, source, created_at)
  select r.id, v_uid, r.date, r.gym_status, r.pt_status, m.new_id, r.rescheduled_to, r.absence_reason, r.notes, 'import', coalesce(r.created_at, now())
  from jsonb_to_recordset(coalesce(t -> 'attendance', '[]')) as r(id uuid, date date, gym_status text, pt_status text, pt_package_id uuid,
       rescheduled_to date, absence_reason text, notes text, created_at timestamptz)
  left join _restore_map m on m.kind = 'package' and m.old_id = r.pt_package_id
  order by r.date
  on conflict do nothing;
  get diagnostics n = row_count; result := result || jsonb_build_object('attendance', n);

  insert into public.pt_ledger (id, user_id, package_id, kind, sessions, session_date, note, created_at)
  select r.id, v_uid, m.new_id, r.kind, r.sessions, r.session_date, r.note, coalesce(r.created_at, now())
  from jsonb_to_recordset(coalesce(t -> 'pt_ledger', '[]')) as r(id uuid, package_id uuid, kind text, sessions int, session_date date,
       note text, voided_at timestamptz, created_at timestamptz)
  join _restore_map m on m.kind = 'package' and m.old_id = r.package_id
  where r.voided_at is null and r.kind in ('refund', 'expired', 'transfer_out', 'adjustment') and r.sessions < 0
  on conflict do nothing;
  get diagnostics n = row_count; result := result || jsonb_build_object('ledger_negative', n);

  perform private.assert_non_negative(m.new_id) from _restore_map m where m.kind = 'package';

  -- Schedule blocks
  insert into public.schedule_blocks (id, user_id, kind, start_date, end_date, package_id, note, created_at)
  select r.id, v_uid, r.kind, r.start_date, r.end_date, m.new_id, r.note, coalesce(r.created_at, now())
  from jsonb_to_recordset(coalesce(t -> 'schedule_blocks', '[]')) as r(id uuid, kind text, start_date date, end_date date, package_id uuid,
       note text, created_at timestamptz)
  left join _restore_map m on m.kind = 'package' and m.old_id = r.package_id
  on conflict do nothing;

  -- Exercises (matched by name) and templates
  insert into public.exercises (id, user_id, name, primary_muscle, secondary_muscles, category, equipment, notes, is_archived, created_at)
  select r.id, v_uid, r.name, r.primary_muscle, coalesce(r.secondary_muscles, '{}'), coalesce(r.category, 'strength'), r.equipment, r.notes,
         coalesce(r.is_archived, false), coalesce(r.created_at, now())
  from jsonb_to_recordset(coalesce(t -> 'exercises', '[]')) as r(id uuid, name text, primary_muscle text, secondary_muscles text[],
       category text, equipment text, notes text, is_archived boolean, created_at timestamptz)
  on conflict do nothing;
  insert into _restore_map
  select 'exercise', r.id, e.id
  from jsonb_to_recordset(coalesce(t -> 'exercises', '[]')) as r(id uuid, name text)
  join public.exercises e on e.user_id = v_uid and lower(btrim(e.name)) = lower(btrim(r.name));

  insert into public.workout_templates (id, user_id, name, workout_type, muscle_groups, exercise_names, is_builtin, created_at)
  select r.id, v_uid, r.name, r.workout_type, coalesce(r.muscle_groups, '{}'), coalesce(r.exercise_names, '{}'), coalesce(r.is_builtin, false),
         coalesce(r.created_at, now())
  from jsonb_to_recordset(coalesce(t -> 'workout_templates', '[]')) as r(id uuid, name text, workout_type text, muscle_groups text[],
       exercise_names text[], is_builtin boolean, created_at timestamptz)
  on conflict do nothing;

  -- Workouts, exercises, sets
  insert into public.workouts (id, user_id, workout_date, start_time, title, workout_type, muscle_groups, duration_min, cardio_type, cardio_min,
         distance_km, energy_level, with_trainer, trainer_notes, personal_notes, discomfort_notes, created_at)
  select r.id, v_uid, r.workout_date, r.start_time, r.title, r.workout_type, coalesce(r.muscle_groups, '{}'), r.duration_min, r.cardio_type,
         r.cardio_min, r.distance_km, r.energy_level, coalesce(r.with_trainer, false), r.trainer_notes, r.personal_notes, r.discomfort_notes,
         coalesce(r.created_at, now())
  from jsonb_to_recordset(coalesce(t -> 'workouts', '[]')) as r(id uuid, workout_date date, start_time time, title text, workout_type text,
       muscle_groups text[], duration_min int, cardio_type text, cardio_min int, distance_km numeric, energy_level smallint,
       with_trainer boolean, trainer_notes text, personal_notes text, discomfort_notes text, created_at timestamptz)
  on conflict do nothing;
  get diagnostics n = row_count; result := result || jsonb_build_object('workouts', n);

  insert into public.workout_exercises (id, user_id, workout_id, exercise_id, position, rest_seconds, notes)
  select r.id, v_uid, r.workout_id, m.new_id, coalesce(r.position, 0), r.rest_seconds, r.notes
  from jsonb_to_recordset(coalesce(t -> 'workout_exercises', '[]')) as r(id uuid, workout_id uuid, exercise_id uuid, position int,
       rest_seconds int, notes text)
  join _restore_map m on m.kind = 'exercise' and m.old_id = r.exercise_id
  join public.workouts w on w.id = r.workout_id and w.user_id = v_uid
  on conflict do nothing;

  insert into public.workout_sets (id, user_id, workout_exercise_id, set_number, reps, weight_kg, duration_sec, is_warmup)
  select r.id, v_uid, r.workout_exercise_id, r.set_number, r.reps, r.weight_kg, r.duration_sec, coalesce(r.is_warmup, false)
  from jsonb_to_recordset(coalesce(t -> 'workout_sets', '[]')) as r(id uuid, workout_exercise_id uuid, set_number int, reps int,
       weight_kg numeric, duration_sec int, is_warmup boolean)
  join public.workout_exercises we on we.id = r.workout_exercise_id and we.user_id = v_uid
  on conflict do nothing;

  -- Measurements and goals
  insert into public.body_measurements (id, user_id, measured_on, metric, value, unit, note, created_at)
  select r.id, v_uid, r.measured_on, r.metric, r.value, coalesce(r.unit, 'kg'), r.note, coalesce(r.created_at, now())
  from jsonb_to_recordset(coalesce(t -> 'body_measurements', '[]')) as r(id uuid, measured_on date, metric text, value numeric, unit text,
       note text, created_at timestamptz)
  on conflict do nothing;

  insert into public.goals (id, user_id, kind, title, target_value, exercise_id, metric, start_date, end_date, is_active, created_at)
  select r.id, v_uid, r.kind, r.title, r.target_value, m.new_id, r.metric, r.start_date, r.end_date, coalesce(r.is_active, true),
         coalesce(r.created_at, now())
  from jsonb_to_recordset(coalesce(t -> 'goals', '[]')) as r(id uuid, kind text, title text, target_value numeric, exercise_id uuid,
       metric text, start_date date, end_date date, is_active boolean, created_at timestamptz)
  left join _restore_map m on m.kind = 'exercise' and m.old_id = r.exercise_id
  on conflict do nothing;

  update public.profiles set seeded_at = coalesce(seeded_at, now()) where id = v_uid;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Private storage for progress photos: <user_id>/<file>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos', 'progress-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update set public = false;

create policy progress_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy progress_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy progress_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy progress_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Privileges for everything defined above
-- ---------------------------------------------------------------------------
revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.initialize_account() from public, anon;
revoke execute on function public.restore_archive(jsonb) from public, anon;
grant execute on function public.initialize_account() to authenticated;
grant execute on function public.restore_archive(jsonb) to authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
