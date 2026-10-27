-- Account deletion tests (run like integration.sql; everything is rolled back).
-- A successful run ends with: ALL DELETION TESTS PASSED (9 checks)

create or replace function pg_temp.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', msg; end if;
  perform set_config('test.count', (coalesce(nullif(current_setting('test.count', true), ''), '0')::int + 1)::text, true);
end $$;
create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
end $$;
do $$
declare u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); p1 uuid; v_err text; v_json jsonb; n int;
begin
  insert into auth.users (id, email, aud, role, raw_app_meta_data, created_at) values
    (u1, 'del-test-' || u1 || '@example.test', 'authenticated', 'authenticated', '{"provider":"google","providers":["google"]}', now()),
    (u2, 'keep-' || u2 || '@example.test', 'authenticated', 'authenticated', '{}', now());
  perform pg_temp.as_user(u2);
  perform public.initialize_account();
  insert into public.attendance (date, gym_status, pt_status) values ('2026-10-05', 'attended', 'not_scheduled');
  execute 'reset role';

  perform pg_temp.as_user(u1);
  perform public.initialize_account();
  p1 := public.create_package(jsonb_build_object('trainer_name','T','price_paise',100000,'sessions_purchased',10,'start_date','2026-10-01',
        'payments', jsonb_build_array(jsonb_build_object('amount_paise',100000,'status','paid','paid_on','2026-10-01'))));
  insert into public.attendance (date, gym_status, pt_status) values ('2026-10-05', 'attended', 'completed');
  perform public.save_workout(jsonb_build_object('workout_date','2026-10-05','exercises', jsonb_build_array(jsonb_build_object('name','Bench Press','sets',jsonb_build_array(jsonb_build_object('reps',10,'weight_kg',30))))));
  insert into public.memberships (gym_name, start_date, duration_months) values ('Gym', '2026-10-01', 3);
  insert into public.body_measurements (measured_on, metric, value) values ('2026-10-05', 'Body weight', 70);

  begin
    perform public.delete_my_account('yes');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok(v_err = 'Type DELETE to confirm.', 'deletion needs the DELETE confirmation');

  v_json := public.delete_my_account('DELETE');
  perform pg_temp.ok((v_json ->> 'deleted')::boolean and (v_json -> 'removed' ->> 'workouts')::int = 1 and (v_json -> 'removed' ->> 'pt_ledger')::int = 1, 'deletion reports what was removed');
  execute 'reset role';

  perform pg_temp.ok(not exists (select 1 from auth.users where id = u1), 'auth user deleted');
  perform pg_temp.ok(not exists (select 1 from auth.identities where user_id = u1), 'login identities deleted');
  select (select count(*) from public.profiles where id = u1) + (select count(*) from public.memberships where user_id = u1)
       + (select count(*) from public.trainers where user_id = u1) + (select count(*) from public.pt_packages where user_id = u1)
       + (select count(*) from public.pt_payments where user_id = u1) + (select count(*) from public.attendance where user_id = u1)
       + (select count(*) from public.pt_ledger where user_id = u1) + (select count(*) from public.exercises where user_id = u1)
       + (select count(*) from public.workout_templates where user_id = u1) + (select count(*) from public.workouts where user_id = u1)
       + (select count(*) from public.workout_exercises where user_id = u1) + (select count(*) from public.workout_sets where user_id = u1)
       + (select count(*) from public.body_measurements where user_id = u1) + (select count(*) from public.goals where user_id = u1)
       + (select count(*) from public.progress_photos where user_id = u1) + (select count(*) from public.schedule_blocks where user_id = u1)
       + (select count(*) from public.audit_log where user_id = u1)
    into n;
  perform pg_temp.ok(n = 0, 'every record of the deleted user is gone (all 17 tables)');
  perform pg_temp.ok((select count(*) from private.deleted_accounts where user_id = u1 and email like 'del-test-%' and providers = '{google}' and deleted_at is not null and account_created_at is not null) = 1, 'deleted account is logged with email, provider and dates');
  perform pg_temp.ok((select count(*) from public.attendance where user_id = u2) = 1 and exists (select 1 from auth.users where id = u2), 'other users are untouched');

  perform pg_temp.as_user(u2);
  begin
    perform count(*) from private.deleted_accounts;
    v_err := null;
  exception when insufficient_privilege then v_err := 'denied';
  end;
  perform pg_temp.ok(v_err = 'denied', 'users cannot read the deleted-accounts log');
  execute 'reset role';
  execute 'set local role anon';
  begin
    perform public.delete_my_account('DELETE');
    v_err := null;
  exception when insufficient_privilege then v_err := 'denied';
  end;
  perform pg_temp.ok(v_err = 'denied', 'signed-out visitors cannot call delete');
  execute 'reset role';
  raise exception 'ALL DELETION TESTS PASSED (% checks)', current_setting('test.count');
end $$;
