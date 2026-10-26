-- Gym Tracker — core schema
-- Money is stored as integer paise (bigint). Calendar dates are stored as `date`
-- values in the user's local calendar (no time-zone conversion is ever applied).

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Private configuration (not exposed through the API)
-- ---------------------------------------------------------------------------
create table if not exists private.app_config (
  key   text primary key,
  value text not null
);
comment on table private.app_config is
  'Server-only settings. owner_email decides which account receives the initial personal seed data.';

-- ---------------------------------------------------------------------------
-- Profiles & settings
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                      uuid primary key references auth.users (id) on delete cascade,
  display_name            text check (display_name is null or length(display_name) <= 80),
  timezone                text not null default 'Asia/Kolkata' check (length(timezone) between 1 and 64),
  currency                text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  date_format             text not null default 'd MMM yyyy' check (date_format in ('d MMM yyyy', 'dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd')),
  theme                   text not null default 'system' check (theme in ('system', 'light', 'dark')),
  weekly_workout_goal     int  not null default 5 check (weekly_workout_goal between 1 and 7),
  renewal_warning_days    int  not null default 7 check (renewal_warning_days between 0 and 90),
  membership_warning_days int  not null default 14 check (membership_warning_days between 0 and 120),
  reminders               jsonb not null default '{
      "upcoming_session": true,
      "package_exhaustion": true,
      "package_expiry": true,
      "membership_expiry": true,
      "pending_payments": true,
      "attendance_confirmation": true,
      "weekly_review": true
    }'::jsonb,
  tracking_start_date     date,
  seeded_at               timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Create a profile row for every new auth user.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(split_part(coalesce(new.email, ''), '@', 1), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Gym memberships
-- ---------------------------------------------------------------------------
create table public.memberships (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users (id) on delete cascade,
  gym_name             text not null check (length(btrim(gym_name)) between 1 and 120),
  start_date           date not null,
  duration_months      int  not null check (duration_months between 1 and 60),
  -- Estimated last valid day: start + N calendar months − 1 day (inclusive convention).
  estimated_end_date   date generated always as (((start_date + make_interval(months => duration_months))::date) - 1) stored,
  -- Contractual last valid day, entered by the user. NULL = not yet confirmed.
  confirmed_end_date   date,
  price_paise          bigint not null default 0 check (price_paise >= 0),
  price_is_approximate boolean not null default false,
  payment_status       text not null default 'unconfirmed' check (payment_status in ('paid', 'pending', 'unconfirmed')),
  paid_on              date,
  notes                text check (notes is null or length(notes) <= 2000),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint memberships_confirmed_after_start check (confirmed_end_date is null or confirmed_end_date >= start_date),
  unique (user_id, gym_name, start_date)
);
create index memberships_user_idx on public.memberships (user_id, start_date desc);
create trigger memberships_touch before update on public.memberships
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Trainers
-- ---------------------------------------------------------------------------
create table public.trainers (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 80),
  phone      text check (phone is null or length(phone) <= 40),
  notes      text check (notes is null or length(notes) <= 2000),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index trainers_user_name_uidx on public.trainers (user_id, lower(btrim(name)));
create trigger trainers_touch before update on public.trainers
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- PT packages (price and session count are immutable once sessions are used)
-- ---------------------------------------------------------------------------
create table public.pt_packages (
  id                         uuid primary key default gen_random_uuid(),
  user_id                    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  trainer_id                 uuid not null,
  label                      text check (label is null or length(label) <= 80),
  price_paise                bigint not null check (price_paise >= 0),
  sessions_purchased         int not null check (sessions_purchased between 1 and 1000),
  purchased_on               date,
  start_date                 date not null,
  expiry_date                date,
  schedule_days              smallint[] not null default '{1,2,3,4,5,6}',
  exclude_sundays            boolean not null default true,
  sessions_per_week          int check (sessions_per_week is null or sessions_per_week between 1 and 7),
  rollover_allowed           boolean not null default false,
  pausable                   boolean not null default false,
  extension_allowed          boolean not null default false,
  status                     text not null default 'active' check (status in ('active', 'completed', 'closed', 'cancelled')),
  closed_on                  date,
  unused_sessions_treatment  text not null default 'undecided'
                               check (unused_sessions_treatment in ('undecided', 'still_usable', 'rolled_over', 'forfeited', 'refunded')),
  renewed_from_id            uuid,
  notes                      text check (notes is null or length(notes) <= 2000),
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (id, user_id),
  foreign key (trainer_id, user_id) references public.trainers (id, user_id) on delete restrict,
  foreign key (renewed_from_id, user_id) references public.pt_packages (id, user_id) on delete set null (renewed_from_id),
  constraint pt_packages_expiry_after_start check (expiry_date is null or expiry_date >= start_date),
  constraint pt_packages_schedule_valid check (
    cardinality(schedule_days) between 1 and 7 and schedule_days <@ array[1,2,3,4,5,6,7]::smallint[]
  ),
  constraint pt_packages_sunday_rule check (not exclude_sundays or not (7 = any (schedule_days))),
  constraint pt_packages_closed_has_date check (status in ('active') or closed_on is not null)
);
create index pt_packages_user_idx on public.pt_packages (user_id, start_date desc);
create index pt_packages_trainer_idx on public.pt_packages (trainer_id);
create trigger pt_packages_touch before update on public.pt_packages
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- PT payments (cash). A pending row is never counted as money spent.
-- ---------------------------------------------------------------------------
create table public.pt_payments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  package_id   uuid not null,
  kind         text not null default 'payment' check (kind in ('payment', 'refund')),
  amount_paise bigint not null check (amount_paise > 0),
  status       text not null default 'paid' check (status in ('paid', 'pending')),
  paid_on      date,
  due_on       date,
  method       text check (method is null or length(method) <= 40),
  note         text check (note is null or length(note) <= 1000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (package_id, user_id) references public.pt_packages (id, user_id) on delete cascade,
  constraint pt_payments_paid_has_date check (status <> 'paid' or paid_on is not null),
  constraint pt_payments_refund_is_settled check (kind <> 'refund' or status = 'paid')
);
create index pt_payments_package_idx on public.pt_payments (package_id);
create index pt_payments_user_idx on public.pt_payments (user_id, paid_on desc);
create trigger pt_payments_touch before update on public.pt_payments
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Attendance: one row per user per calendar date.
-- gym_status and pt_status are deliberately independent.
-- ---------------------------------------------------------------------------
create table public.attendance (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date            date not null,
  gym_status      text not null default 'unverified'
                    check (gym_status in ('attended', 'absent', 'rest', 'unverified')),
  pt_status       text not null default 'unverified'
                    check (pt_status in ('completed', 'chargeable_absence', 'missed_unconfirmed',
                                         'trainer_cancelled', 'rescheduled', 'not_scheduled', 'unverified')),
  pt_package_id   uuid,
  rescheduled_to  date,
  absence_reason  text check (absence_reason is null or absence_reason in ('work', 'illness', 'travel', 'tired', 'personal', 'other')),
  notes           text check (notes is null or length(notes) <= 2000),
  source          text not null default 'manual' check (source in ('manual', 'seed', 'import', 'quick', 'workout')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, date),
  unique (id, user_id),
  foreign key (pt_package_id, user_id) references public.pt_packages (id, user_id) on delete restrict,
  constraint attendance_reschedule_target check (
    rescheduled_to is null or (pt_status = 'rescheduled' and rescheduled_to <> date)
  )
);
create index attendance_user_date_idx on public.attendance (user_id, date desc);
create index attendance_package_idx on public.attendance (pt_package_id);
create trigger attendance_touch before update on public.attendance
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- PT session ledger. Append-only; corrections void an entry instead of deleting it.
--   completed  : −1  (session used, attended)
--   forfeited  : −1  (confirmed chargeable absence)
--   credit     : +n  (sessions granted by trainer, e.g. make-up for a cancellation)
--   refund     : −n  (sessions removed from the balance because money was returned)
--   expired    : −n  (unused sessions explicitly forfeited when a package was closed/expired)
--   transfer_out / transfer_in : ∓n (unused sessions explicitly rolled over to another package)
--   adjustment : ±n  (manual correction with a note)
-- remaining = sessions_purchased + Σ(sessions of non-voided entries)
-- ---------------------------------------------------------------------------
create table public.pt_ledger (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  package_id    uuid not null,
  kind          text not null check (kind in ('completed', 'forfeited', 'credit', 'refund', 'expired',
                                               'transfer_in', 'transfer_out', 'adjustment')),
  sessions      int not null check (sessions <> 0 and sessions between -1000 and 1000),
  session_date  date,
  attendance_id uuid,
  note          text check (note is null or length(note) <= 1000),
  voided_at     timestamptz,
  void_reason   text check (void_reason is null or length(void_reason) <= 500),
  created_at    timestamptz not null default now(),
  foreign key (package_id, user_id) references public.pt_packages (id, user_id) on delete cascade,
  foreign key (attendance_id) references public.attendance (id) on delete set null,
  constraint pt_ledger_sign check (
    (kind in ('completed', 'forfeited') and sessions = -1 and session_date is not null)
    or (kind = 'credit' and sessions > 0)
    or (kind = 'refund' and sessions < 0)
    or (kind = 'expired' and sessions < 0)
    or (kind = 'transfer_in' and sessions > 0)
    or (kind = 'transfer_out' and sessions < 0)
    or (kind = 'adjustment' and note is not null)
  ),
  constraint pt_ledger_void_reason check (voided_at is null or void_reason is not null)
);
-- At most one active session consumption per calendar day and per attendance record.
create unique index pt_ledger_one_consumption_per_day
  on public.pt_ledger (user_id, session_date)
  where voided_at is null and kind in ('completed', 'forfeited');
create unique index pt_ledger_one_active_per_attendance
  on public.pt_ledger (attendance_id)
  where voided_at is null and attendance_id is not null;
create index pt_ledger_package_idx on public.pt_ledger (package_id) where voided_at is null;
create index pt_ledger_user_date_idx on public.pt_ledger (user_id, session_date desc);

-- ---------------------------------------------------------------------------
-- Schedule blocks: planned rest days, vacations, trainer unavailability,
-- public holidays and package pauses. Used for forecasting only.
-- ---------------------------------------------------------------------------
create table public.schedule_blocks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('vacation', 'rest', 'trainer_unavailable', 'holiday', 'pause')),
  start_date date not null,
  end_date   date not null,
  package_id uuid,
  note       text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now(),
  foreign key (package_id, user_id) references public.pt_packages (id, user_id) on delete cascade,
  constraint schedule_blocks_range check (end_date >= start_date and end_date - start_date <= 366)
);
create index schedule_blocks_user_idx on public.schedule_blocks (user_id, start_date);

-- ---------------------------------------------------------------------------
-- Exercise library, templates and workouts
-- ---------------------------------------------------------------------------
create table public.exercises (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name              text not null check (length(btrim(name)) between 1 and 80),
  primary_muscle    text not null check (length(primary_muscle) between 1 and 40),
  secondary_muscles text[] not null default '{}',
  category          text not null default 'strength' check (category in ('strength', 'cardio', 'mobility', 'other')),
  equipment         text check (equipment is null or length(equipment) <= 40),
  notes             text check (notes is null or length(notes) <= 1000),
  is_archived       boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, user_id)
);
create unique index exercises_user_name_uidx on public.exercises (user_id, lower(btrim(name)));
create trigger exercises_touch before update on public.exercises
  for each row execute function public.touch_updated_at();

create table public.workout_templates (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name           text not null check (length(btrim(name)) between 1 and 60),
  workout_type   text,
  muscle_groups  text[] not null default '{}',
  exercise_names text[] not null default '{}',
  is_builtin     boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index workout_templates_user_name_uidx on public.workout_templates (user_id, lower(btrim(name)));
create trigger workout_templates_touch before update on public.workout_templates
  for each row execute function public.touch_updated_at();

create table public.workouts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  workout_date     date not null,
  start_time       time,
  title            text check (title is null or length(title) <= 80),
  workout_type     text check (workout_type is null or length(workout_type) <= 40),
  muscle_groups    text[] not null default '{}',
  duration_min     int check (duration_min is null or duration_min between 1 and 600),
  cardio_type      text check (cardio_type is null or length(cardio_type) <= 40),
  cardio_min       int check (cardio_min is null or cardio_min between 1 and 600),
  distance_km      numeric(6,2) check (distance_km is null or distance_km between 0 and 1000),
  energy_level     smallint check (energy_level is null or energy_level between 1 and 5),
  with_trainer     boolean not null default false,
  trainer_notes    text check (trainer_notes is null or length(trainer_notes) <= 2000),
  personal_notes   text check (personal_notes is null or length(personal_notes) <= 2000),
  discomfort_notes text check (discomfort_notes is null or length(discomfort_notes) <= 2000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, user_id)
);
create index workouts_user_date_idx on public.workouts (user_id, workout_date desc);
create trigger workouts_touch before update on public.workouts
  for each row execute function public.touch_updated_at();

create table public.workout_exercises (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  workout_id   uuid not null,
  exercise_id  uuid not null,
  position     int not null default 0 check (position between 0 and 100),
  rest_seconds int check (rest_seconds is null or rest_seconds between 0 and 1800),
  notes        text check (notes is null or length(notes) <= 1000),
  unique (id, user_id),
  foreign key (workout_id, user_id) references public.workouts (id, user_id) on delete cascade,
  foreign key (exercise_id, user_id) references public.exercises (id, user_id) on delete restrict
);
create index workout_exercises_workout_idx on public.workout_exercises (workout_id, position);
create index workout_exercises_exercise_idx on public.workout_exercises (exercise_id);

create table public.workout_sets (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  workout_exercise_id uuid not null,
  set_number          int not null check (set_number between 1 and 50),
  reps                int check (reps is null or reps between 0 and 1000),
  weight_kg           numeric(6,2) check (weight_kg is null or weight_kg between 0 and 1000),
  duration_sec        int check (duration_sec is null or duration_sec between 0 and 36000),
  is_warmup           boolean not null default false,
  foreign key (workout_exercise_id, user_id) references public.workout_exercises (id, user_id) on delete cascade,
  unique (workout_exercise_id, set_number)
);

-- ---------------------------------------------------------------------------
-- Progress: measurements, goals, photos
-- ---------------------------------------------------------------------------
create table public.body_measurements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  measured_on date not null,
  metric      text not null check (length(btrim(metric)) between 1 and 40),
  value       numeric(7,2) not null check (value > 0 and value < 10000),
  unit        text not null default 'kg' check (unit in ('kg', 'cm', 'in', 'lb', '%')),
  note        text check (note is null or length(note) <= 500),
  created_at  timestamptz not null default now(),
  unique (user_id, measured_on, metric)
);
create index body_measurements_user_idx on public.body_measurements (user_id, metric, measured_on);

create table public.goals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind         text not null check (kind in ('weekly_attendance', 'workout_count', 'exercise_weight', 'streak', 'measurement', 'custom')),
  title        text not null check (length(btrim(title)) between 1 and 120),
  target_value numeric(8,2),
  exercise_id  uuid,
  metric       text,
  start_date   date not null default current_date,
  end_date     date,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  foreign key (exercise_id, user_id) references public.exercises (id, user_id) on delete set null (exercise_id),
  constraint goals_range check (end_date is null or end_date >= start_date)
);
create index goals_user_idx on public.goals (user_id) where is_active;

create table public.progress_photos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  taken_on     date not null,
  storage_path text not null unique,
  note         text check (note is null or length(note) <= 500),
  created_at   timestamptz not null default now(),
  constraint progress_photos_path_owner check (split_part(storage_path, '/', 1) = user_id::text)
);
create index progress_photos_user_idx on public.progress_photos (user_id, taken_on desc);

-- ---------------------------------------------------------------------------
-- Audit log (written only by triggers)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  table_name  text not null,
  record_id   uuid,
  action      text not null check (action in ('insert', 'update', 'delete')),
  old_data    jsonb,
  new_data    jsonb,
  changed     text[],
  created_at  timestamptz not null default now()
);
create index audit_log_user_idx on public.audit_log (user_id, created_at desc);
create index audit_log_record_idx on public.audit_log (record_id);

create or replace function private.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_changed text[];
  v_user uuid := coalesce((v_new ->> 'user_id')::uuid, (v_old ->> 'user_id')::uuid, (v_new ->> 'id')::uuid, (v_old ->> 'id')::uuid);
begin
  -- Skip rows removed by an account deletion cascade.
  if v_user is null or not exists (select 1 from auth.users where id = v_user) then
    return null;
  end if;

  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into v_changed
    from jsonb_object_keys(v_new) k
    where k not in ('updated_at') and (v_new -> k) is distinct from (v_old -> k);
    if v_changed is null then
      return null; -- nothing meaningful changed
    end if;
  end if;

  insert into public.audit_log (user_id, table_name, record_id, action, old_data, new_data, changed)
  values (v_user, tg_table_name, coalesce((v_new ->> 'id')::uuid, (v_old ->> 'id')::uuid),
          lower(tg_op), v_old, v_new, v_changed);
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['memberships', 'trainers', 'pt_packages', 'pt_payments', 'attendance',
                           'pt_ledger', 'workouts', 'schedule_blocks', 'profiles', 'goals']
  loop
    execute format(
      'create trigger %I_audit after insert or update or delete on public.%I
         for each row execute function private.audit_row()', t, t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.memberships       enable row level security;
alter table public.trainers          enable row level security;
alter table public.pt_packages       enable row level security;
alter table public.pt_payments       enable row level security;
alter table public.attendance        enable row level security;
alter table public.pt_ledger         enable row level security;
alter table public.schedule_blocks   enable row level security;
alter table public.exercises         enable row level security;
alter table public.workout_templates enable row level security;
alter table public.workouts          enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.workout_sets      enable row level security;
alter table public.body_measurements enable row level security;
alter table public.goals             enable row level security;
alter table public.progress_photos   enable row level security;
alter table public.audit_log         enable row level security;

create policy profiles_select on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Full owner access for ordinary user-owned tables.
do $$
declare t text;
begin
  foreach t in array array['memberships', 'trainers', 'pt_packages', 'pt_payments', 'attendance',
                           'schedule_blocks', 'exercises', 'workout_templates', 'workouts',
                           'workout_exercises', 'workout_sets', 'body_measurements', 'goals', 'progress_photos']
  loop
    execute format('create policy %I_owner_select on public.%I for select to authenticated using (user_id = (select auth.uid()))', t, t);
    execute format('create policy %I_owner_insert on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t, t);
    execute format('create policy %I_owner_update on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t, t);
    execute format('create policy %I_owner_delete on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t, t);
  end loop;
end;
$$;

-- The ledger and audit log are read-only for clients; writes happen in
-- SECURITY DEFINER triggers/functions that validate ownership themselves.
create policy pt_ledger_owner_select on public.pt_ledger for select to authenticated using (user_id = (select auth.uid()));
create policy audit_log_owner_select on public.audit_log for select to authenticated using (user_id = (select auth.uid()));

-- Anonymous users get nothing.
revoke all on all tables in schema public from anon;
revoke insert, update, delete on public.pt_ledger, public.audit_log from authenticated;
