-- Workout planner.
--
-- Shared, read-only reference data (every signed-in user can read it, nobody can change it):
--   plan_exercises        exercise catalog with target muscles, equipment, instructions and a
--                         verified YouTube Shorts demo (DeltaBolic / TylerPath) or 'pending'
--   plan_templates        the default plan ("Default 5-day split")
--   plan_template_days    Mon–Sun of a template (lifting day or rest day)
--   plan_template_items   the prescription for each exercise on each day
-- Source: the user's coaching PDF, Section C (5-day workout, weeks 5–12 baseline).
--
-- Private per-user data (owner-only RLS, removed with the account):
--   workout_plans         named custom plans; `days` holds all 7 days as JSON
--   planner_settings      active plan, custom sets/reps on the default plan, step target, cardio days
--   daily_activity        one row per day: steps, cardio, warm-up, mobility and movement checklists

-- ---------------------------------------------------------------------------
-- Shared reference data
-- ---------------------------------------------------------------------------
create table public.plan_exercises (
  id                text primary key check (id ~ '^[a-z0-9_]{2,60}$'),
  name              text not null check (length(btrim(name)) between 1 and 120),
  target_muscles    text[] not null default '{}',
  equipment         text not null check (length(equipment) <= 120),
  instructions      text not null check (length(instructions) <= 1200),
  video_id          text check (video_id is null or video_id ~ '^[A-Za-z0-9_-]{11}$'),
  video_url         text check (video_url is null or video_url like 'https://www.youtube.com/shorts/%'),
  video_title       text,
  video_creator     text check (video_creator is null or video_creator in ('DeltaBolic', 'TylerPath')),
  video_status      text not null default 'pending' check (video_status in ('verified', 'pending')),
  video_verified_on date,
  check ((video_status = 'verified') = (video_id is not null and video_url is not null and video_creator is not null))
);

create table public.plan_templates (
  id          text primary key check (id ~ '^[a-z0-9_]{2,40}$'),
  name        text not null,
  description text,
  is_default  boolean not null default false
);
create unique index plan_templates_one_default on public.plan_templates (is_default) where is_default;

create table public.plan_template_days (
  template_id text not null references public.plan_templates (id) on delete cascade,
  weekday     smallint not null check (weekday between 1 and 7), -- ISO: 1 = Monday
  title       text not null,
  focus       text,
  is_rest     boolean not null default false,
  primary key (template_id, weekday)
);

create table public.plan_template_items (
  template_id   text not null,
  weekday       smallint not null,
  position      smallint not null check (position between 1 and 30),
  exercise_id   text not null references public.plan_exercises (id),
  sets          smallint not null check (sets between 1 and 10),
  reps_min      smallint not null check (reps_min between 1 and 100),
  reps_max      smallint not null check (reps_max between 1 and 100),
  reps_unit     text not null default '' check (reps_unit in ('', '/leg', '/arm', '/side')),
  rir           text not null check (rir ~ '^[0-5](–[0-5])?$'),
  rest_min_s    smallint not null check (rest_min_s between 0 and 600),
  rest_max_s    smallint not null check (rest_max_s between 0 and 600),
  notes         text,
  primary key (template_id, weekday, position),
  foreign key (template_id, weekday) references public.plan_template_days (template_id, weekday) on delete cascade,
  check (reps_min <= reps_max and rest_min_s <= rest_max_s)
);
create index plan_template_items_exercise_idx on public.plan_template_items (exercise_id);

alter table public.plan_exercises      enable row level security;
alter table public.plan_templates      enable row level security;
alter table public.plan_template_days  enable row level security;
alter table public.plan_template_items enable row level security;
create policy plan_exercises_read      on public.plan_exercises      for select to authenticated using (true);
create policy plan_templates_read      on public.plan_templates      for select to authenticated using (true);
create policy plan_template_days_read  on public.plan_template_days  for select to authenticated using (true);
create policy plan_template_items_read on public.plan_template_items for select to authenticated using (true);
revoke insert, update, delete, truncate on public.plan_exercises, public.plan_templates, public.plan_template_days, public.plan_template_items from anon, authenticated;
revoke all on public.plan_exercises, public.plan_templates, public.plan_template_days, public.plan_template_items from anon;

-- ---------------------------------------------------------------------------
-- Private user data
-- ---------------------------------------------------------------------------
create table public.workout_plans (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 60),
  days       jsonb not null check (jsonb_typeof(days) = 'array' and jsonb_array_length(days) = 7 and pg_column_size(days) < 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index workout_plans_user_name_uidx on public.workout_plans (user_id, lower(btrim(name)));
create trigger workout_plans_touch before update on public.workout_plans
  for each row execute function public.touch_updated_at();

create table public.planner_settings (
  user_id           uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  active_plan_id    uuid,  -- null = the shared default plan
  default_overrides jsonb not null default '{}' check (jsonb_typeof(default_overrides) = 'object' and pg_column_size(default_overrides) < 20000),
  step_target       int not null default 9000 check (step_target between 1000 and 50000),
  cardio_days       smallint[] not null default '{1,4,6}' check (cardio_days <@ '{1,2,3,4,5,6,7}'::smallint[] and cardinality(cardio_days) <= 7),
  updated_at        timestamptz not null default now(),
  foreign key (active_plan_id, user_id) references public.workout_plans (id, user_id) on delete set null (active_plan_id)
);
create index planner_settings_active_plan_idx on public.planner_settings (active_plan_id, user_id);
create trigger planner_settings_touch before update on public.planner_settings
  for each row execute function public.touch_updated_at();

create table public.daily_activity (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  log_date   date not null,
  steps      int check (steps is null or steps between 0 and 200000),
  cardio     jsonb not null default '{}' check (jsonb_typeof(cardio) = 'object' and pg_column_size(cardio) < 4000),
  warmup     jsonb not null default '{}' check (jsonb_typeof(warmup) = 'object' and pg_column_size(warmup) < 4000),
  mobility   jsonb not null default '{}' check (jsonb_typeof(mobility) = 'object' and pg_column_size(mobility) < 4000),
  neat       jsonb not null default '{}' check (jsonb_typeof(neat) = 'object' and pg_column_size(neat) < 4000),
  updated_at timestamptz not null default now(),
  unique (user_id, log_date)
);
create trigger daily_activity_touch before update on public.daily_activity
  for each row execute function public.touch_updated_at();

alter table public.workout_plans    enable row level security;
alter table public.planner_settings enable row level security;
alter table public.daily_activity   enable row level security;
do $$
declare t text;
begin
  foreach t in array array['workout_plans', 'planner_settings', 'daily_activity'] loop
    execute format('create policy %I_owner_select on public.%I for select to authenticated using (user_id = (select auth.uid()))', t, t);
    execute format('create policy %I_owner_insert on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t, t);
    execute format('create policy %I_owner_update on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t, t);
    execute format('create policy %I_owner_delete on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t, t);
  end loop;
end $$;
revoke all on public.workout_plans, public.planner_settings, public.daily_activity from anon;

-- ---------------------------------------------------------------------------
-- Seed: exercise catalog and verified demos (checked 27 Oct 2026 via YouTube oEmbed:
-- title, channel, embeddable, vertical Shorts format).
-- ---------------------------------------------------------------------------
insert into public.plan_exercises (id, name, target_muscles, equipment, instructions, video_id, video_title, video_creator) values
('incline_db_press', 'Incline dumbbell press (bench ~30°)', '{Upper chest,Front delts,Triceps}', 'Dumbbells, adjustable bench',
 'Set the bench to about 30°. Shoulder blades back and down, feet planted. Lower the dumbbells for 2–3 s to chest level with elbows about 45–60° from the torso, then press up and slightly in.',
 'oS2Uy3MAbgs', 'Incline Dumbbell Press Guide', 'DeltaBolic'),
('chest_supported_row', 'Chest-supported row (machine or T-bar)', '{Upper back,Lats,Rear delts}', 'Chest-supported row machine or T-bar',
 'Keep your chest on the pad the whole set. Pull the elbows back toward the hips, pause 1 s with the shoulder blades squeezed, then lower under control.',
 'G35gTqGcXXA', 'Chest Supported Row Variations', 'DeltaBolic'),
('lat_pulldown', 'Lat pulldown (shoulder-width or neutral grip)', '{Lats,Upper back,Biceps}', 'Cable pulldown station',
 'Thighs locked under the pad. Let the lats stretch fully at the top, then drive the elbows down to the sides. Lean back no more than about 15°.',
 'lmatGLlm1qs', 'How to Do Lat Pulldown', 'DeltaBolic'),
('machine_chest_press', 'Machine chest press (flat)', '{Chest,Front delts,Triceps}', 'Chest press machine',
 'Set the seat so the handles line up with mid-chest. Shoulder blades back, press without locking out hard, return slowly. Safe to push close to failure.',
 'VHIlmOPMWWs', 'How to Do the PERFECT Machine Chest Press', 'DeltaBolic'),
('cable_lateral_raise', 'Cable lateral raise (one arm)', '{Side delts}', 'Cable machine, single handle',
 'Stand side-on to a low pulley. Lead with the elbow and raise the arm out to the side, stopping at shoulder height. Lower slowly; no swinging.',
 'JlT2xB92lY8', 'Cable Lateral Raise Complete Guide', 'DeltaBolic'),
('triceps_pushdown', 'Cable triceps pushdown (rope or bar)', '{Triceps}', 'Cable machine, rope or bar',
 'Elbows pinned to your sides. Push down until the arms are straight, squeeze the triceps, then let the hands rise to about chest height under control.',
 'jMIMHK_L6cg', 'Triceps Pushdown Guide', 'DeltaBolic'),
('incline_db_curl', 'Incline dumbbell curl', '{Biceps}', 'Dumbbells, incline bench',
 'Lie back on an incline bench with the arms hanging straight down. Curl without moving the elbows forward, then lower to a full stretch. No swinging.',
 'uH3eBjuvhvI', 'The PERFECT Incline Bicep Curl', 'DeltaBolic'),
('leg_press', 'Leg press or hack squat', '{Quads,Glutes,Adductors}', 'Leg press or hack squat machine',
 'Go as deep as your lower back stays on the pad. Knees track over the toes. Lower for 2–3 s, push through the whole foot without locking the knees.',
 '1PTD0mfKOQg', 'How to Do the PERFECT Leg Press', 'DeltaBolic'),
('romanian_deadlift', 'Romanian deadlift (dumbbell → barbell once taught)', '{Hamstrings,Glutes,Lower back}', 'Dumbbells (barbell later)',
 'Soft knees, push the hips back with a neutral spine and keep the weight close to the legs. Stop when the hamstrings are fully stretched, then drive the hips forward. No bouncing.',
 'QbbURJEUALw', 'The PERFECT Dumbbell Romanian Deadlift', 'DeltaBolic'),
('leg_extension', 'Leg extension', '{Quads}', 'Leg extension machine',
 'Line the knee up with the machine pivot. Extend until the legs are straight, pause 1 s at the top, lower under control.',
 'uM86QE59Tgc', 'The PERFECT Leg Extension', 'DeltaBolic'),
('leg_curl', 'Seated or lying leg curl', '{Hamstrings}', 'Leg curl machine (seated preferred)',
 'Seated is preferred for the longer muscle length. Curl the heels down and back, squeeze, then return slowly to a full stretch.',
 'EnZZIaPCb8k', '✅ The PERFECT Leg Curl', 'DeltaBolic'),
('standing_calf_raise', 'Standing calf raise (machine)', '{Calves}', 'Standing calf raise machine',
 'Lower the heels to a deep stretch and pause 2 s at the bottom, then rise as high as you can onto the big toe. No bouncing.',
 'PLmYFSagwms', 'Best Way to do Calf Raises for Bigger Calves', 'TylerPath'),
('cable_crunch', 'Cable crunch (kneeling)', '{Abs}', 'Cable machine, rope',
 'Kneel facing the pulley, rope beside your head. Curl the ribcage toward the pelvis by rounding the spine — don''t just bend at the hips.',
 'RQjrmGTbxjI', '❌ FIX Your Cable Crunch Mistakes!', 'DeltaBolic'),
('seated_shoulder_press', 'Seated dumbbell or machine shoulder press', '{Front delts,Side delts,Triceps}', 'Dumbbells with a back-supported bench, or a shoulder press machine',
 'Back supported and ribs down — don''t flare the ribs or arch. Press up and slightly in, lower until the hands are around ear level.',
 'k6tzKisR3NY', 'The PERFECT Dumbbell Shoulder Press (DO THIS!)', 'DeltaBolic'),
('assisted_pullup', 'Assisted pull-up or neutral-grip pulldown', '{Lats,Upper back,Biceps}', 'Assisted pull-up machine or pulldown with a neutral handle',
 'Start from a dead hang, pull the chest toward the bar by driving the elbows down. Reduce the assistance over the months.',
 'b3L_d3zACC0', 'If you Have this Assisted Pull-ups Machine at your Gym… USE IT', 'TylerPath'),
('low_incline_smith_press', 'Low-incline Smith or machine press (15–30°)', '{Upper chest,Front delts,Triceps}', 'Smith machine and incline bench, or incline press machine',
 'Bench at 15–30°. Lower the bar to the upper chest with elbows slightly tucked, press back up without bouncing. Second upper-chest hit of the week.',
 'VXaBbUYMfIs', '✅ The PERFECT Incline Smith Machine Bench Press', 'DeltaBolic'),
('seated_cable_row', 'Seated cable row (neutral grip)', '{Upper back,Mid traps,Lats}', 'Seated cable row, neutral handle',
 'Sit tall with the chest up. Row the handle to the lower ribs, squeeze the shoulder blades, then let them stretch forward under control.',
 'wAU8VdcRAMQ', 'The PERFECT Cable Row', 'DeltaBolic'),
('db_lateral_raise', 'Dumbbell lateral raise', '{Side delts}', 'Dumbbells',
 'Light weight, strict form. Raise the arms out to the sides leading with the elbows, stop at shoulder height, lower slowly.',
 'lMYs7FY8os4', '✅ The PERFECT Lateral Raise', 'DeltaBolic'),
('reverse_pec_deck', 'Reverse pec deck', '{Rear delts,Upper back}', 'Pec deck / rear delt machine',
 'Chest against the pad, arms nearly straight. Sweep the handles back in an arc until in line with the body, pause, return slowly.',
 'H5UxZFl0lgk', '✅ The PERFECT Rear Delt Machine Fly (DO THIS!)', 'DeltaBolic'),
('overhead_cable_triceps', 'Overhead cable triceps extension', '{Triceps (long head)}', 'Cable machine, rope',
 'Face away from the pulley with the rope behind your head. Keep the elbows pointing forward and extend the arms fully, then return to a deep stretch.',
 'NTk0Igxqcsk', 'The PERFECT High Cable Overhead Triceps Extension', 'DeltaBolic'),
('hammer_curl', 'Hammer curl', '{Brachialis,Forearms,Biceps}', 'Dumbbells',
 'Palms facing each other the whole rep. Curl without swinging and lower under control. Can be paired with the previous exercise to save time.',
 '26wMyQKQGyQ', 'Two Ways to do Dumbbell Hammer Curls', 'TylerPath'),
('db_split_squat', 'Dumbbell split squat (rear foot on the floor; Bulgarian later)', '{Quads,Glutes}', 'Dumbbells (support if needed)',
 'Long stance, rear foot on the floor at first. Hold a support if needed. Lean the torso slightly forward for more glutes and lower until the back knee nearly touches.',
 'FZjybNmTFR0', 'Lunge & Split Squats: Quads vs. Glutes', 'DeltaBolic'),
('hip_thrust', 'Hip thrust (machine or barbell)', '{Glutes,Hamstrings}', 'Hip thrust machine or barbell and bench',
 'Chin tucked and ribs down. Drive through the heels until the hips are level with the knees, squeeze 1 s at the top, lower under control.',
 'sxOrVuCvWq4', 'The PERFECT Machine Hip Thrust', 'DeltaBolic'),
('seated_leg_curl', 'Seated leg curl', '{Hamstrings}', 'Seated leg curl machine',
 'Lock the thigh pad down, lean the torso slightly forward. Curl the heels under you, squeeze, return slowly to a full stretch.',
 'xdbEG3xGLI8', '✅ The PERFECT Seated Leg Curl Tips', 'DeltaBolic'),
('leg_press_high_wide', 'Leg press (feet high and wide)', '{Glutes,Quads,Adductors}', 'Leg press machine',
 'Place the feet high and wider than the hips to shift work to the glutes and adductors. Extra quad/glute volume — control the depth.',
 'MICiHJ67xTI', 'Leg Press Foot Placement & Muscles Worked', 'DeltaBolic'),
('back_extension_45', '45° back extension (rounded upper back, glute focus)', '{Glutes,Hamstrings,Lower back}', '45° back extension bench',
 'Pad just below the hips. Round the upper back slightly and drive with the glutes to raise the torso; don''t hyperextend at the top.',
 'KbHoC--dDwA', 'Hyperextension: Glutes vs. Lower Back', 'DeltaBolic'),
('seated_calf_raise', 'Seated calf raise', '{Calves (soleus)}', 'Seated calf raise machine',
 'Knees under the pad. Lower to a deep stretch, pause, then press up as high as possible.',
 'FsqE-g1C5fk', 'How to do Seated Calf Raises Correctly', 'TylerPath'),
('hanging_knee_raise', 'Hanging knee raise (→ hanging leg raise later) or reverse crunch', '{Abs,Hip flexors}', 'Pull-up bar or captain''s chair (or floor for reverse crunch)',
 'Hang still, then curl the knees up and tilt the pelvis back at the top (posterior pelvic tilt). Lower slowly without swinging.',
 'mc0IojJmpzQ', 'How to do Hanging Leg Raises the Easy, Medium, and Hard Way', 'TylerPath'),
('pallof_press', 'Pallof press', '{Core,Obliques}', 'Cable machine or band',
 'Stand side-on to the cable with the handle at your chest. Brace and press the hands straight out without letting the torso rotate, hold briefly, return. Anti-rotation bracing.',
 null, null, null),
('lat_pulldown_wide', 'Lat pulldown (wide or single-arm cable pulldown)', '{Lats,Upper back}', 'Cable pulldown station or single handle',
 'Wide grip or one arm at a time. Full stretch at the top, drive the elbow down toward the hip and squeeze the lats.',
 'RFgiCDJs8Nk', 'Lat Pulldown Variations', 'DeltaBolic'),
('low_to_high_cable_fly', 'Low-to-high cable fly or incline machine press', '{Upper chest,Front delts}', 'Cable machine (or incline press machine)',
 'Pulleys low, slight bend in the elbows. Sweep the hands up and together to about chin height, squeeze the upper chest, return slowly. Third upper-chest hit.',
 'EjwP7AIPGBg', 'The Best Way to do Low to High Cable Fly for Upper Chest', 'TylerPath'),
('one_arm_db_row', 'One-arm dumbbell row (bench-supported)', '{Lats,Upper back}', 'Dumbbell, flat bench',
 'One hand and knee on the bench, back flat. Pull the dumbbell toward the hip (not the chest) for lats, lower to a full stretch.',
 'ayEgIsW2PKg', 'How to Fix Your Single Arm Dumbbell Row (For Lats)', 'TylerPath'),
('cable_db_lateral_raise', 'Cable or dumbbell lateral raise', '{Side delts}', 'Cable machine or dumbbells',
 'Raise the arms out to the sides leading with the elbows to shoulder height, lower slowly. Third lateral-delt hit of the week.',
 'lMYs7FY8os4', '✅ The PERFECT Lateral Raise', 'DeltaBolic'),
('face_pull', 'Face pull (rope, to forehead)', '{Rear delts,Rotator cuff,Upper back}', 'Cable machine, rope',
 'Pulley at head height. Pull the rope toward the forehead, splitting the ends and rotating the hands back. Rear delts and rotator cuff.',
 'ywQsaOTRjzM', '✅ Do Face Pulls LIKE THIS!', 'DeltaBolic'),
('ez_cable_curl', 'EZ-bar or cable curl', '{Biceps}', 'EZ-bar or cable machine',
 'Elbows by your sides. Curl without leaning back, squeeze at the top, lower fully.',
 '6Fa2Y5dUQ2s', 'The Best Way to do EZ Curl Bar Bicep Curls', 'TylerPath'),
('skull_crusher', 'EZ-bar skull crusher or cable overhead extension', '{Triceps}', 'EZ-bar and flat bench (or cable)',
 'Upper arms angled slightly back. Lower the bar toward the top of the head by bending only at the elbows, then extend.',
 'RetiLFQobXU', '✅  The PERFECT Skull Crusher', 'DeltaBolic');

update public.plan_exercises
   set video_url = 'https://www.youtube.com/shorts/' || video_id,
       video_status = 'verified',
       video_verified_on = date '2026-10-27'
 where video_id is not null;

-- ---------------------------------------------------------------------------
-- Seed: the default plan (Mon Upper A, Tue Lower A, Wed Upper B, Thu Lower B, Fri Upper C,
-- Sat/Sun rest from lifting).
-- ---------------------------------------------------------------------------
insert into public.plan_templates (id, name, description, is_default) values
('default_5day', 'Default 5-day split', 'Upper/lower split built on double progression. Sets are hard sets at the listed RIR; warm-up sets don''t count.', true);

insert into public.plan_template_days (template_id, weekday, title, focus, is_rest) values
('default_5day', 1, 'Upper A', 'Chest/back emphasis, upper chest first', false),
('default_5day', 2, 'Lower A', 'Quad/hinge', false),
('default_5day', 3, 'Upper B', 'Shoulders/vertical, upper chest again', false),
('default_5day', 4, 'Lower B', 'Unilateral/glutes/hamstrings', false),
('default_5day', 5, 'Upper C', 'Aesthetic: V-taper, delts, arms', false),
('default_5day', 6, 'Rest day', 'Rest from lifting — Zone 2 cardio and the posture routine', true),
('default_5day', 7, 'Rest day', 'Full rest — steps only', true);

insert into public.plan_template_items (template_id, weekday, position, exercise_id, sets, reps_min, reps_max, reps_unit, rir, rest_min_s, rest_max_s, notes) values
('default_5day', 1, 1, 'incline_db_press',       3,  6, 10, '',      '2',   120, 180, 'Upper chest priority. Shoulder blades set back and down, elbows ~45–60° from torso'),
('default_5day', 1, 2, 'chest_supported_row',    3,  8, 12, '',      '2',   120, 120, 'Chest stays on the pad. Pull elbows toward hips. Pause 1 s at the top'),
('default_5day', 1, 3, 'lat_pulldown',           3,  8, 12, '',      '1–2', 120, 120, 'Lats/V-taper. Full stretch at the top, no leaning back past ~15°'),
('default_5day', 1, 4, 'machine_chest_press',    2,  8, 12, '',      '1–2', 120, 120, 'Safe to push close to failure'),
('default_5day', 1, 5, 'cable_lateral_raise',    3, 12, 20, '',      '1',    60,  90, 'Lateral delts. Lead with the elbow, stop at shoulder height'),
('default_5day', 1, 6, 'triceps_pushdown',       2, 10, 15, '',      '1',    60,  90, 'Elbows pinned at your sides'),
('default_5day', 1, 7, 'incline_db_curl',        2, 10, 15, '',      '1',    60,  90, 'Biceps in a stretched position. No swinging'),

('default_5day', 2, 1, 'leg_press',              3,  8, 12, '',      '2',   120, 180, 'Go as deep as your lower back stays on the pad. Knees track over toes'),
('default_5day', 2, 2, 'romanian_deadlift',      3,  8, 10, '',      '2–3', 120, 180, 'Hips back, neutral spine, bar close to the legs. Stop when the hamstrings are fully stretched'),
('default_5day', 2, 3, 'leg_extension',          2, 10, 15, '',      '1',    90,  90, 'Pause 1 s at the top'),
('default_5day', 2, 4, 'leg_curl',               2, 10, 15, '',      '1',    90,  90, 'Seated is preferred (longer muscle length)'),
('default_5day', 2, 5, 'standing_calf_raise',    3, 10, 15, '',      '1–2',  60,  90, '2 s pause at the bottom stretch'),
('default_5day', 2, 6, 'cable_crunch',           3, 10, 15, '',      '1–2',  60,  90, 'Curl the ribcage toward the pelvis. Don''t just bend at the hips'),

('default_5day', 3, 1, 'seated_shoulder_press',  3,  6, 10, '',      '2',   120, 180, 'Back supported. Don''t flare the ribs'),
('default_5day', 3, 2, 'assisted_pullup',        3,  6, 10, '',      '2',   120, 120, 'Reduce the assistance over the months'),
('default_5day', 3, 3, 'low_incline_smith_press',3,  8, 12, '',      '1–2', 120, 120, 'Second upper-chest hit'),
('default_5day', 3, 4, 'seated_cable_row',       3, 10, 12, '',      '1–2', 120, 120, 'Upper back and mid-traps. Chest tall'),
('default_5day', 3, 5, 'db_lateral_raise',       3, 12, 20, '',      '1',    60,  90, 'Light weight, strict form'),
('default_5day', 3, 6, 'reverse_pec_deck',       2, 12, 20, '',      '1',    60,  90, 'Rear delts, which help posture and “3D shoulders”'),
('default_5day', 3, 7, 'overhead_cable_triceps', 2, 10, 15, '',      '1',    60,  90, 'Long head of the triceps'),
('default_5day', 3, 8, 'hammer_curl',            2, 10, 15, '',      '1',    60,  90, 'Brachialis and forearms. Optional pairing with the previous exercise to save time'),

('default_5day', 4, 1, 'db_split_squat',         3,  8, 12, '/leg',  '2',   120, 120, 'Hold a support if needed. Torso slightly forward for glutes'),
('default_5day', 4, 2, 'hip_thrust',             3,  8, 12, '',      '2',   120, 120, 'Chin tucked, ribs down, 1 s squeeze at the top'),
('default_5day', 4, 3, 'seated_leg_curl',        3,  8, 12, '',      '1',    90,  90, null),
('default_5day', 4, 4, 'leg_press_high_wide',    2, 10, 15, '',      '1–2', 120, 120, 'Extra quad/glute volume'),
('default_5day', 4, 5, 'back_extension_45',      2, 10, 15, '',      '2',    90,  90, 'Strengthens the posterior chain'),
('default_5day', 4, 6, 'seated_calf_raise',      3, 12, 20, '',      '1',    60,  60, null),
('default_5day', 4, 7, 'hanging_knee_raise',     3,  8, 15, '',      '1–2',  60,  90, 'Posterior pelvic tilt at the top'),
('default_5day', 4, 8, 'pallof_press',           2, 10, 10, '/side', '2',    60,  60, 'Anti-rotation bracing'),

('default_5day', 5, 1, 'lat_pulldown_wide',      3,  8, 12, '',      '1–2', 120, 120, 'Lats'),
('default_5day', 5, 2, 'low_to_high_cable_fly',  3, 10, 15, '',      '1',    90,  90, 'Third upper-chest hit'),
('default_5day', 5, 3, 'one_arm_db_row',         3,  8, 12, '/arm',  '1–2',  90,  90, 'Pull toward the hip for lats'),
('default_5day', 5, 4, 'cable_db_lateral_raise', 3, 12, 20, '',      '0–1',  60,  90, 'Third lateral-delt hit'),
('default_5day', 5, 5, 'face_pull',              2, 12, 15, '',      '1–2',  60,  60, 'Rear delts and rotator cuff'),
('default_5day', 5, 6, 'ez_cable_curl',          3,  8, 12, '',      '1',    60,  90, null),
('default_5day', 5, 7, 'skull_crusher',          3,  8, 12, '',      '1',    60,  90, null);
