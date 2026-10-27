-- Gym Tracker — database integration tests.
--
-- Runs against a real Supabase database as the `authenticated` role with RLS on.
-- Everything happens inside one DO block that ends by raising an exception, so
-- every change (including the throwaway test users) is rolled back.
-- A successful run fails with: "ALL INTEGRATION TESTS PASSED (<n> checks)".
-- Any other error message is a failing check.
--
-- Run with:  npm run test:db   (uses psql + SUPABASE_DB_URL)
--      or paste into the Supabase SQL editor.

create or replace function pg_temp.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then
    raise exception 'FAIL: %', msg;
  end if;
  perform set_config('test.count', (coalesce(nullif(current_setting('test.count', true), ''), '0')::int + 1)::text, true);
end $$;

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
end $$;

do $$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  u3 uuid := gen_random_uuid();
  p1 uuid; p2 uuid; tr uuid;
  a_id uuid; w_id uuid;
  s record;
  n int; v_err text; v_json jsonb; v_archive jsonb;
begin
  insert into auth.users (id, email, aud, role) values
    (u1, 'it-user-1-' || u1 || '@example.test', 'authenticated', 'authenticated'),
    (u2, 'it-user-2-' || u2 || '@example.test', 'authenticated', 'authenticated'),
    (u3, 'it-owner-' || u3 || '@example.test', 'authenticated', 'authenticated');
  perform pg_temp.ok((select count(*) from public.profiles where id in (u1, u2, u3)) = 3, 'profile trigger creates profiles');

  -- ===================================================================
  -- Test 1 — initial package: ₹6,000 / 30 sessions → ₹200 per session
  -- ===================================================================
  perform pg_temp.as_user(u1);
  p1 := public.create_package(jsonb_build_object(
    'trainer_name', 'Soham', 'price_paise', 600000, 'sessions_purchased', 30,
    'start_date', '2026-09-29', 'schedule_days', jsonb_build_array(1,2,3,4,5,6), 'exclude_sundays', true));
  select * into s from public.package_summary where id = p1;
  perform pg_temp.ok(s.price_paise / s.sessions_purchased = 20000, 'T1 cost per session is ₹200 (20000 paise)');
  perform pg_temp.ok(s.remaining = 30, 'T1 new package has 30 sessions remaining');
  perform pg_temp.ok(s.paid_paise = 0 and s.outstanding_paise = 600000, 'T1 unpaid package shows no money paid');

  -- ===================================================================
  -- Test 2 — completed session → 29 remaining
  -- ===================================================================
  insert into public.attendance (date, gym_status, pt_status) values ('2026-10-05', 'attended', 'completed');
  select * into s from public.package_summary where id = p1;
  perform pg_temp.ok(s.remaining = 29 and s.completed = 1, 'T2 one completed session leaves 29');

  -- ===================================================================
  -- Test 3 — chargeable missed session, cannot be deducted twice
  -- ===================================================================
  insert into public.attendance (date, gym_status, pt_status, absence_reason)
  values ('2026-10-06', 'absent', 'chargeable_absence', 'work') returning id into a_id;
  select * into s from public.package_summary where id = p1;
  perform pg_temp.ok(s.remaining = 28 and s.forfeited = 1, 'T3 chargeable absence deducts one session');
  update public.attendance set pt_status = 'chargeable_absence', notes = 'edited note' where id = a_id;
  select * into s from public.package_summary where id = p1;
  perform pg_temp.ok(s.remaining = 28 and s.forfeited = 1, 'T3 re-saving the same absence does not deduct again');
  begin
    insert into public.attendance (date, gym_status, pt_status) values ('2026-10-06', 'absent', 'chargeable_absence');
    v_err := null;
  exception when unique_violation then v_err := 'dup';
  end;
  perform pg_temp.ok(v_err = 'dup', 'T3/T16 a second attendance row for the same date is rejected');
  begin
    insert into public.pt_ledger (package_id, kind, sessions, session_date) values (p1, 'forfeited', -1, '2026-10-06');
    v_err := null;
  exception when insufficient_privilege then v_err := 'denied';
  end;
  perform pg_temp.ok(v_err = 'denied', 'T3/T16 clients cannot write ledger entries directly');

  -- ===================================================================
  -- Test 4 — gym absence with no PT scheduled leaves the balance alone
  -- ===================================================================
  insert into public.attendance (date, gym_status, pt_status) values ('2026-10-11', 'absent', 'not_scheduled');
  insert into public.attendance (date, gym_status, pt_status) values ('2026-10-12', 'absent', 'unverified');
  insert into public.attendance (date, gym_status, pt_status) values ('2026-10-13', 'absent', 'missed_unconfirmed');
  select * into s from public.package_summary where id = p1;
  perform pg_temp.ok(s.remaining = 28, 'T4/T12 gym absences, unverified and unconfirmed PT do not change the balance');
  perform pg_temp.ok(s.missed_unconfirmed = 1, 'T12 unconfirmed PT miss is tracked separately');

  -- ===================================================================
  -- Test 5 — trainer cancellation is not a forfeited session
  -- ===================================================================
  insert into public.attendance (date, gym_status, pt_status) values ('2026-10-07', 'attended', 'trainer_cancelled');
  select * into s from public.package_summary where id = p1;
  perform pg_temp.ok(s.remaining = 28 and s.trainer_cancelled = 1 and s.forfeited = 1, 'T5 trainer cancellation does not deduct');
  insert into public.attendance (date, gym_status, pt_status, absence_reason) values ('2026-10-09', 'absent', 'client_cancelled', 'work');
  select * into s from public.package_summary where id = p1;
  perform pg_temp.ok(s.remaining = 28 and s.client_cancelled = 1, 'a session you cancelled is not deducted and is counted separately');
  perform pg_temp.ok((select pt_package_id from public.attendance where date = '2026-10-09') = p1, 'a session you cancelled is linked to its package');

  -- ===================================================================
  -- Test 6 — reschedule: one session, one deduction
  -- ===================================================================
  insert into public.attendance (date, gym_status, pt_status, rescheduled_to) values ('2026-10-08', 'absent', 'rescheduled', '2026-10-10');
  insert into public.attendance (date, gym_status, pt_status) values ('2026-10-10', 'attended', 'completed');
  select * into s from public.package_summary where id = p1;
  perform pg_temp.ok(s.remaining = 27 and s.rescheduled = 1 and s.completed = 2, 'T6 rescheduled session deducted only once (on the make-up date)');
  perform pg_temp.ok((select count(*) from public.pt_ledger where session_date = '2026-10-08') = 0, 'T6 original date has no ledger entry');

  -- Corrections are reversible and audited
  update public.attendance set pt_status = 'completed', gym_status = 'attended' where id = a_id;
  select * into s from public.package_summary where id = p1;
  perform pg_temp.ok(s.remaining = 27 and s.forfeited = 0 and s.completed = 3, 'correction: absence → completed swaps entry without double counting');
  perform pg_temp.ok((select count(*) from public.pt_ledger where attendance_id = a_id and voided_at is not null) = 1, 'correction: previous entry voided, not deleted');
  update public.attendance set pt_status = 'unverified' where id = a_id;
  select * into s from public.package_summary where id = p1;
  perform pg_temp.ok(s.remaining = 28, 'correction: marking unverified restores the session');
  perform pg_temp.ok((select count(*) from public.audit_log where record_id = a_id) >= 3, 'audit trail records every attendance change');
  update public.attendance set pt_status = 'chargeable_absence' where id = a_id;  -- back to a confirmed absence

  -- ===================================================================
  -- Test 7 — renewal keeps the old package intact
  -- ===================================================================
  p2 := public.create_package(jsonb_build_object(
    'trainer_name', 'soham ', 'price_paise', 800000, 'sessions_purchased', 24, 'start_date', '2026-11-02',
    'renewed_from_id', p1,
    'payments', jsonb_build_array(jsonb_build_object('amount_paise', 800000, 'status', 'paid', 'paid_on', '2026-11-01'))));
  perform pg_temp.ok((select count(*) from public.trainers) = 1, 'T7 renewal reuses the existing trainer (case-insensitive)');
  select * into s from public.package_summary where id = p1;
  perform pg_temp.ok(s.price_paise = 600000 and s.sessions_purchased = 30 and s.remaining = 27, 'T7 old package unchanged by renewal');
  select * into s from public.package_summary where id = p2;
  perform pg_temp.ok(s.price_paise / s.sessions_purchased = 33333 and s.remaining = 24 and s.paid_paise = 800000, 'T7 new package has its own rate and payment');
  begin
    update public.pt_packages set price_paise = 700000 where id = p1;
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok(v_err like 'Price and session count are locked%', 'T7 used package price cannot be rewritten');
  begin
    insert into public.attendance (date, gym_status, pt_status, pt_package_id) values ('2026-10-29', 'attended', 'completed', p2);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok(v_err like 'The package starts on%', 'T7/T9 future package cannot be deducted before it starts');
  insert into public.attendance (date, gym_status, pt_status) values ('2026-10-29', 'attended', 'completed');
  perform pg_temp.ok((select pt_package_id from public.attendance where date = '2026-10-29') = p1, 'T9 auto-assignment picks the package active on that date');
  perform pg_temp.ok((select remaining from public.package_summary where id = p2) = 24, 'T7 future package untouched');

  -- ===================================================================
  -- Test 15 — pending payments are not money paid
  -- ===================================================================
  insert into public.pt_payments (package_id, amount_paise, status, due_on) values (p1, 400000, 'pending', '2026-11-15');
  select * into s from public.package_summary where id = p1;
  perform pg_temp.ok(s.paid_paise = 0 and s.pending_paise = 400000 and s.outstanding_paise = 600000, 'T15 pending payment not counted as paid');
  insert into public.pt_payments (package_id, amount_paise, status, paid_on) values (p1, 200000, 'paid', '2026-10-01');
  select * into s from public.package_summary where id = p1;
  perform pg_temp.ok(s.paid_paise = 200000 and s.outstanding_paise = 400000, 'T15 partial payment reduces outstanding balance');
  begin
    insert into public.pt_payments (package_id, amount_paise, status) values (p1, 1000, 'paid');
    v_err := null;
  exception when check_violation then v_err := 'chk';
  end;
  perform pg_temp.ok(v_err = 'chk', 'T15 a paid payment needs a payment date');

  -- ===================================================================
  -- Credits, refunds, balance floor, closure and rollover
  -- ===================================================================
  perform public.record_session_adjustment(p1, 'credit', 2, 'Make-up for trainer cancellation', '2026-10-07');
  perform pg_temp.ok((select remaining from public.package_summary where id = p1) = 28, 'credit adds sessions');
  begin
    perform public.record_session_adjustment(p1, 'refund', 100, 'too many');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok(v_err like 'This change would leave the package with%', 'balance can never go negative');
  begin
    perform public.void_session_adjustment((select id from public.pt_ledger where kind = 'completed' limit 1), 'nope');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok(v_err like 'Session entries come from attendance%', 'attendance-derived entries cannot be voided directly');

  perform public.close_package(p1, '2026-11-01', 'rolled_over', p2, null);
  perform pg_temp.ok((select remaining from public.package_summary where id = p1) = 0, 'rollover empties the closed package');
  perform pg_temp.ok((select remaining from public.package_summary where id = p2) = 24 + 28, 'rollover adds exactly the unused sessions to the new package');
  perform pg_temp.ok((select status from public.pt_packages where id = p1) = 'completed', 'closed package keeps its history with status completed');
  perform pg_temp.ok((select completed + forfeited from public.package_summary where id = p1) = 4, 'closed package history intact (3 completed + 1 forfeited)');

  -- ===================================================================
  -- Test 17 — workout with several exercises; edit keeps history
  -- ===================================================================
  w_id := public.save_workout(jsonb_build_object(
    'workout_date', '2026-10-05', 'title', 'Chest & Triceps', 'duration_min', 60, 'with_trainer', true,
    'muscle_groups', jsonb_build_array('chest', 'triceps'),
    'exercises', jsonb_build_array(
      jsonb_build_object('name', 'Bench Press', 'sets', jsonb_build_array(
        jsonb_build_object('reps', 10, 'weight_kg', 30), jsonb_build_object('reps', 8, 'weight_kg', 32.5))),
      jsonb_build_object('name', 'Cable Fly', 'sets', jsonb_build_array(jsonb_build_object('reps', 12, 'weight_kg', 10))),
      jsonb_build_object('name', 'Triceps Pushdown', 'sets', jsonb_build_array(jsonb_build_object('reps', 12, 'weight_kg', 20))))));
  perform pg_temp.ok((select count(*) from public.workout_exercises where workout_id = w_id) = 3, 'T17 workout saved with 3 exercises');
  perform pg_temp.ok((select count(*) from public.workout_sets ws join public.workout_exercises we on we.id = ws.workout_exercise_id where we.workout_id = w_id) = 4, 'T17 all sets saved');
  perform public.save_workout(jsonb_build_object(
    'id', w_id, 'workout_date', '2026-10-05', 'title', 'Chest & Triceps (edited)', 'duration_min', 65,
    'exercises', jsonb_build_array(
      jsonb_build_object('name', 'Bench Press', 'sets', jsonb_build_array(jsonb_build_object('reps', 10, 'weight_kg', 35))),
      jsonb_build_object('name', 'Cable Fly', 'sets', jsonb_build_array(jsonb_build_object('reps', 12, 'weight_kg', 12.5))))));
  perform pg_temp.ok((select title from public.workouts where id = w_id) = 'Chest & Triceps (edited)', 'T17 edit persisted');
  perform pg_temp.ok((select max(ws.weight_kg) from public.workout_sets ws join public.workout_exercises we on we.id = ws.workout_exercise_id where we.workout_id = w_id) = 35, 'T17 edited weight persisted');
  perform pg_temp.ok((select count(*) from public.audit_log where record_id = w_id) >= 2, 'T17 workout edits are audited');
  perform pg_temp.ok((select count(*) from public.workouts) = 1, 'T17 edit did not duplicate the workout');

  -- Snapshot u1 data for the restore test below.
  select jsonb_build_object('format', 'gym-tracker-archive', 'version', 1, 'tables', jsonb_build_object(
    'trainers', (select jsonb_agg(to_jsonb(x)) from public.trainers x),
    'pt_packages', (select jsonb_agg(to_jsonb(x)) from public.pt_packages x),
    'pt_payments', (select jsonb_agg(to_jsonb(x)) from public.pt_payments x),
    'pt_ledger', (select jsonb_agg(to_jsonb(x)) from public.pt_ledger x),
    'attendance', (select jsonb_agg(to_jsonb(x)) from public.attendance x),
    'exercises', (select jsonb_agg(to_jsonb(x)) from public.exercises x),
    'workouts', (select jsonb_agg(to_jsonb(x)) from public.workouts x),
    'workout_exercises', (select jsonb_agg(to_jsonb(x)) from public.workout_exercises x),
    'workout_sets', (select jsonb_agg(to_jsonb(x)) from public.workout_sets x)))
  into v_archive;

  -- ===================================================================
  -- Test 11 — user isolation
  -- ===================================================================
  execute 'reset role';
  select id into tr from public.trainers where user_id = u1;
  perform pg_temp.as_user(u2);
  perform pg_temp.ok((select count(*) from public.attendance) = 0, 'T11 user 2 sees no attendance of user 1');
  perform pg_temp.ok((select count(*) from public.pt_packages) = 0, 'T11 user 2 sees no packages of user 1');
  perform pg_temp.ok((select count(*) from public.package_summary) = 0, 'T11 summary view respects RLS');
  perform pg_temp.ok((select count(*) from public.pt_ledger) = 0, 'T11 user 2 sees no ledger of user 1');
  perform pg_temp.ok((select count(*) from public.audit_log where user_id <> u2) = 0, 'T11 user 2 sees no audit log of user 1');
  perform pg_temp.ok((select count(*) from public.workouts) = 0, 'T11 user 2 sees no workouts of user 1');
  update public.attendance set pt_status = 'completed' where date = '2026-10-06';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'T11 user 2 cannot update user 1 attendance');
  delete from public.pt_packages where id = p1;
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'T11 user 2 cannot delete user 1 packages');
  begin
    insert into public.attendance (user_id, date, gym_status, pt_status) values (u1, '2026-12-01', 'attended', 'unverified');
    v_err := null;
  exception when insufficient_privilege then v_err := 'rls';
  end;
  perform pg_temp.ok(v_err = 'rls', 'T11 user 2 cannot insert rows owned by user 1');
  begin
    insert into public.pt_packages (trainer_id, price_paise, sessions_purchased, start_date) values (tr, 100, 1, '2026-10-01');
    v_err := null;
  exception when foreign_key_violation then v_err := 'fk';
  end;
  perform pg_temp.ok(v_err = 'fk', 'T11 user 2 cannot attach a package to user 1''s trainer');
  begin
    perform public.record_session_adjustment(p2, 'credit', 5, 'steal');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok(v_err = 'PT package not found.', 'T11 RPCs refuse other users'' packages');
  begin
    perform public.close_package(p2, '2026-12-01', 'forfeited');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok(v_err = 'PT package not found.', 'T11 user 2 cannot close user 1 package');

  -- Restore: user 2 restores user 1's archive → gets copies? No: ids belong to user 1,
  -- so nothing may be attached to user 1's rows and user 1 is unaffected.
  begin
    v_json := public.restore_archive(v_archive);
  exception when others then v_json := jsonb_build_object('error', sqlerrm);
  end;
  execute 'reset role';
  perform pg_temp.ok((select count(*) from public.pt_packages where user_id = u1) = 2, 'restore by another user never touches the original owner''s data');
  perform pg_temp.ok((select count(*) from public.pt_packages where user_id = u2 and id in (p1, p2)) = 0, 'restore cannot take over another user''s record ids');

  -- ===================================================================
  -- Tests 13 & 14 — owner seed: ten absences, Sunday rule, estimated vs confirmed expiry, idempotent
  -- ===================================================================
  insert into private.app_config (key, value) values ('owner_email', 'it-owner-' || u3 || '@example.test')
    on conflict (key) do update set value = excluded.value;
  perform pg_temp.as_user(u3);
  v_json := public.initialize_account();
  perform pg_temp.ok((v_json ->> 'seeded')::boolean, 'T13 owner account receives the initial seed');
  perform pg_temp.ok((select onboarded_at is not null and pt_enabled and membership_enabled from public.profiles where id = u3), 'owner seed skips onboarding and turns PT on');
  perform pg_temp.ok((select count(*) from public.attendance) = 10, 'T13 exactly ten absence dates seeded (no invented attendance)');
  perform pg_temp.ok((select count(*) from public.attendance where gym_status = 'absent') = 10, 'T13 all ten are confirmed gym absences');
  perform pg_temp.ok((select pt_status from public.attendance where date = '2026-10-11') = 'not_scheduled', 'T13 11 Oct (Sunday) is not a scheduled PT absence');
  perform pg_temp.ok((select count(*) from public.attendance where pt_status = 'unverified') = 9, 'T12/T13 PT outcome of the other nine stays unverified');
  perform pg_temp.ok((select count(*) from public.pt_ledger) = 0, 'T12 seed creates no session transactions');
  perform pg_temp.ok((select count(*) from public.pt_payments) = 0, 'seed creates no financial transactions');
  perform pg_temp.ok((select count(*) from public.workouts) = 0, 'seed creates no workouts');
  select * into s from public.package_summary;
  perform pg_temp.ok(s.trainer_name = 'Soham' and s.price_paise = 600000 and s.sessions_purchased = 30 and s.remaining = 30, 'T13 Soham package seeded with 30 sessions');
  perform pg_temp.ok((select estimated_end_date from public.memberships) = '2026-12-28', 'T14 estimated expiry = 28 Dec 2026');
  perform pg_temp.ok((select confirmed_end_date from public.memberships) is null, 'T14 confirmed expiry stays empty until the user confirms it');
  perform pg_temp.ok((select price_is_approximate and payment_status = 'unconfirmed' from public.memberships), 'membership price flagged approximate and unconfirmed');
  perform pg_temp.ok((select count(*) from public.exercises) >= 40, 'exercise library seeded');
  v_json := public.initialize_account();
  v_json := public.initialize_account();
  perform pg_temp.ok((select count(*) from public.attendance) = 10 and (select count(*) from public.pt_packages) = 1
                     and (select count(*) from public.memberships) = 1 and (select count(*) from public.trainers) = 1,
                     'T16 repeated initialisation creates no duplicates');

  -- Non-owner accounts get defaults only.
  perform pg_temp.as_user(u2);
  v_json := public.initialize_account();
  perform pg_temp.ok(v_json ->> 'reason' = 'not_owner', 'other accounts do not receive personal seed data');
  perform pg_temp.ok((select count(*) from public.memberships) = 0, 'other accounts start empty');
  perform pg_temp.ok((select onboarded_at is null and not pt_enabled from public.profiles where id = u2), 'new accounts go through onboarding with PT off until they choose it');
  update public.profiles set pt_enabled = true, birth_date = '1999-10-27', height_cm = 178, onboarded_at = now() where id = u2;
  perform pg_temp.ok((select pt_enabled and height_cm = 178 from public.profiles where id = u2), 'users can update their own onboarding answers');
  begin
    update public.profiles set height_cm = 400 where id = u2;
    v_err := null;
  exception when check_violation then v_err := 'chk';
  end;
  perform pg_temp.ok(v_err = 'chk', 'implausible height is rejected');

  -- Restore into an account: second restore of the same archive inserts nothing.
  execute 'reset role';
  perform pg_temp.as_user(u3);
  select jsonb_build_object('format', 'gym-tracker-archive', 'version', 1, 'tables', jsonb_build_object(
    'trainers', (select jsonb_agg(to_jsonb(x)) from public.trainers x),
    'pt_packages', (select jsonb_agg(to_jsonb(x)) from public.pt_packages x),
    'attendance', (select jsonb_agg(to_jsonb(x)) from public.attendance x)))
  into v_archive;
  v_json := public.restore_archive(v_archive);
  perform pg_temp.ok((v_json ->> 'attendance')::int = 0 and (v_json ->> 'pt_packages')::int = 0, 'restoring an archive twice creates no duplicates');

  execute 'reset role';
  raise exception 'ALL INTEGRATION TESTS PASSED (% checks)', current_setting('test.count');
end;
$$;
