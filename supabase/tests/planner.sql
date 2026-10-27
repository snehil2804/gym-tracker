-- Workout planner tests (run like integration.sql; everything is rolled back).
-- A successful run ends with: ALL PLANNER TESTS PASSED (14 checks) — reported as an error so nothing is kept.

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
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); pa uuid; n int; v_err text;
  week jsonb := '[{"weekday":1,"title":"A","rest":false,"items":[]},{"weekday":2,"title":"R","rest":true,"items":[]},{"weekday":3,"title":"R","rest":true,"items":[]},
                  {"weekday":4,"title":"R","rest":true,"items":[]},{"weekday":5,"title":"R","rest":true,"items":[]},{"weekday":6,"title":"R","rest":true,"items":[]},
                  {"weekday":7,"title":"R","rest":true,"items":[]}]';
begin
  insert into auth.users (id, email, aud, role, created_at) values
    (a, 'plan-a-' || a || '@example.test', 'authenticated', 'authenticated', now()),
    (b, 'plan-b-' || b || '@example.test', 'authenticated', 'authenticated', now());

  -- Shared template: readable, not writable
  perform pg_temp.as_user(a);
  select count(*) into n from public.plan_template_items where template_id = 'default_5day';
  perform pg_temp.ok(n = 36, 'default plan has 36 exercises (PDF Section C)');
  select count(*) into n from public.plan_exercises where video_status = 'verified' and video_creator in ('DeltaBolic', 'TylerPath');
  perform pg_temp.ok(n >= 35, 'verified demos come from DeltaBolic / TylerPath');
  begin
    update public.plan_template_items set sets = 9 where template_id = 'default_5day';
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok(v_err is not null, 'users cannot modify the shared default plan');
  begin
    insert into public.plan_exercises (id, name, equipment, instructions) values ('hack', 'x', 'x', 'x');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok(v_err is not null, 'users cannot add to the shared catalog');

  -- A's private data
  insert into public.workout_plans (name, days) values ('A plan', week) returning id into pa;
  insert into public.planner_settings (active_plan_id, default_overrides) values (pa, '{"1:1":{"sets":4}}');
  insert into public.daily_activity (log_date, steps, cardio) values ('2026-10-27', 8000, '{"done":true}');
  begin
    insert into public.workout_plans (name, days) values ('a PLAN', week);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok(v_err like '%workout_plans_user_name_uidx%', 'plan names are unique per user (case-insensitive)');
  begin
    insert into public.workout_plans (name, days) values ('Short', '[]');
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok(v_err is not null, 'a plan must have 7 days');
  execute 'reset role';

  -- B cannot see or touch A's rows
  perform pg_temp.as_user(b);
  select count(*) into n from public.workout_plans;
  perform pg_temp.ok(n = 0, 'B sees none of A''s plans');
  select count(*) into n from public.daily_activity;
  perform pg_temp.ok(n = 0, 'B sees none of A''s activity');
  select count(*) into n from public.planner_settings;
  perform pg_temp.ok(n = 0, 'B sees none of A''s settings');
  update public.workout_plans set name = 'hijacked' where id = pa;
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'B cannot rename A''s plan');
  delete from public.daily_activity where log_date = '2026-10-27';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'B cannot delete A''s activity');
  begin
    insert into public.planner_settings (active_plan_id) values (pa);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok(v_err is not null, 'B cannot point their settings at A''s plan');
  begin
    insert into public.workout_plans (user_id, name, days) values (a, 'planted', week);
    v_err := null;
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok(v_err is not null, 'B cannot create a plan owned by A');
  execute 'reset role';

  -- Deleting A's plan clears the active plan (back to the default) but keeps settings
  perform pg_temp.as_user(a);
  delete from public.workout_plans where id = pa;
  select count(*) into n from public.planner_settings where active_plan_id is null and default_overrides ? '1:1';
  perform pg_temp.ok(n = 1, 'deleting the active plan falls back to the default plan');
  execute 'reset role';

  raise exception 'ALL PLANNER TESTS PASSED (% checks)', current_setting('test.count');
end $$;
