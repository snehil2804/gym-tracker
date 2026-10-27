-- Demo videos for every exercise in the library.
--
-- * public.exercises gets a YouTube Shorts demo (video_id/url/title/creator) and an optional link
--   to the planner catalog (catalog_id). Users can set or change their own exercise's Short.
-- * public.exercise_demos is a shared, read-only lookup (exercise name → verified Short). A trigger
--   fills in the demo whenever an exercise is created or renamed without one, so the built-in
--   library, planner exercises and exercises created while logging all get a video.
-- * plan_exercises gets primary_muscle so planner exercises can be filed under muscle groups.
-- Every video below was checked on 27 Oct 2026 via YouTube oEmbed (title, channel, embeddable,
-- vertical Shorts format).

alter table public.exercises
  add column video_id      text check (video_id is null or video_id ~ '^[A-Za-z0-9_-]{11}$'),
  add column video_url     text check (video_url is null or video_url ~ '^https://www\.youtube\.com/shorts/[A-Za-z0-9_-]{11}$'),
  add column video_title   text check (video_title is null or length(video_title) <= 200),
  add column video_creator text check (video_creator is null or length(video_creator) <= 80),
  add column catalog_id    text references public.plan_exercises (id) on delete set null;
create index exercises_catalog_idx on public.exercises (catalog_id);

alter table public.plan_exercises
  add column primary_muscle text not null default 'other'
    check (primary_muscle in ('chest','back','shoulders','biceps','triceps','forearms','quads','hamstrings','glutes','calves','core','cardio','other'));

create table public.exercise_demos (
  name_key      text primary key check (name_key = lower(btrim(name_key))),
  video_id      text not null check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  video_title   text not null,
  video_creator text not null
);
alter table public.exercise_demos enable row level security;
create policy exercise_demos_read on public.exercise_demos for select to authenticated using (true);
revoke insert, update, delete, truncate on public.exercise_demos from anon, authenticated;
revoke all on public.exercise_demos from anon;

-- Built-in library (seed_exercises) names
insert into public.exercise_demos (name_key, video_id, video_title, video_creator) values
('bench press', '5NStATS0zrw', 'The PERFECT Bench Press', 'DeltaBolic'),
('incline bench press', '98HWfiRonkE', 'The Perfect Incline Bench Press‼️', 'DeltaBolic'),
('dumbbell bench press', 'mTaiQemkEpU', '✅ The PERFECT Dumbbell Chest Press', 'DeltaBolic'),
('incline dumbbell press', 'oS2Uy3MAbgs', 'Incline Dumbbell Press Guide', 'DeltaBolic'),
('cable fly', '14VcTQz6h-8', 'The PERFECT Cable Chest Fly', 'DeltaBolic'),
('pec deck', 'XZg28DIf1oc', 'How to Perform the PERFECT Machine Chest Fly', 'DeltaBolic'),
('chest press machine', 'VHIlmOPMWWs', 'How to Do the PERFECT Machine Chest Press', 'DeltaBolic'),
('push-up', 'EGShi0FcidE', '✅ Do Pushups LIKE THIS!', 'DeltaBolic'),
('chest dip', 'kY9vB8WxVf0', 'How to Do Chest Focused Dips', 'TylerPath'),
('deadlift', 'xNwpvDuZJ3k', '✅ The PERFECT Deadlift (DO THIS!)', 'DeltaBolic'),
('lat pulldown', 'lmatGLlm1qs', 'How to Do Lat Pulldown', 'DeltaBolic'),
('pull-up', 'g_cCyYK8my4', 'The PERFECT Pull-Up (DO THIS!)', 'DeltaBolic'),
('seated cable row', 'wAU8VdcRAMQ', 'The PERFECT Cable Row', 'DeltaBolic'),
('barbell row', 'HRo7m_Dfpxw', '✅ The PERFECT Barbell Back Row', 'DeltaBolic'),
('dumbbell row', 'q8E9XaizZpY', 'PERFECT Dumbbell Row (DO THIS!)', 'DeltaBolic'),
('t-bar row', 'J1tuctWsqCU', 'How to do T-Bar Rows for Mid Back', 'TylerPath'),
('shrug', 'h0zFdmOH-K0', 'Do Shrugs Like THIS INSTEAD! (For BIGGER TRAPS)', 'DeltaBolic'),
('overhead press', '4LBVP2Oe7fg', '✅ The PERFECT Barbell Overhead Press', 'DeltaBolic'),
('dumbbell shoulder press', 'k6tzKisR3NY', 'The PERFECT Dumbbell Shoulder Press (DO THIS!)', 'DeltaBolic'),
('lateral raise', 'lMYs7FY8os4', '✅ The PERFECT Lateral Raise', 'DeltaBolic'),
('front raise', 'eJ_HNftboic', '❌ Front Raise Mistake', 'DeltaBolic'),
('rear delt fly', 'LsT-bR_zxLo', 'The PERFECT Dumbbell Rear Delt Fly (DO THIS!)', 'DeltaBolic'),
('face pull', 'ywQsaOTRjzM', '✅ Do Face Pulls LIKE THIS!', 'DeltaBolic'),
('barbell curl', '54x2WF1_Suc', 'The Perfect Barbell Bicep Curl (DO THIS!)', 'DeltaBolic'),
('dumbbell curl', 'VC-1LJvgv2o', 'How to Actually do Dumbbell Bicep Curls Properly (And Not Cheat)', 'TylerPath'),
('hammer curl', '26wMyQKQGyQ', 'Two Ways to do Dumbbell Hammer Curls', 'TylerPath'),
('preacher curl', 'WyAVZn6_PIY', '✅ PERFECT Preacher Curl Form', 'DeltaBolic'),
('triceps pushdown', 'jMIMHK_L6cg', 'Triceps Pushdown Guide', 'DeltaBolic'),
('overhead triceps extension', 'NTk0Igxqcsk', 'The PERFECT High Cable Overhead Triceps Extension', 'DeltaBolic'),
('skull crusher', 'RetiLFQobXU', '✅  The PERFECT Skull Crusher', 'DeltaBolic'),
('close-grip bench press', 'xXd7sddHGa0', 'How to Perform the Perfect Close-Grip Bench Press', 'DeltaBolic'),
('squat', 'dW3zj79xfrc', '✅ The PERFECT Barbell Squat', 'DeltaBolic'),
('leg press', '1PTD0mfKOQg', 'How to Do the PERFECT Leg Press', 'DeltaBolic'),
('romanian deadlift', 'QbbURJEUALw', 'The PERFECT Dumbbell Romanian Deadlift', 'DeltaBolic'),
('leg extension', 'uM86QE59Tgc', 'The PERFECT Leg Extension', 'DeltaBolic'),
('leg curl', 'EnZZIaPCb8k', '✅ The PERFECT Leg Curl', 'DeltaBolic'),
('walking lunge', 'qW8hbNznyzo', 'How to do Walking Lunges Correctly', 'TylerPath'),
('bulgarian split squat', 'Cow3ESXmrTU', '✅ The PERFECT Bulgarian Split Squat', 'DeltaBolic'),
('hip thrust', 'sxOrVuCvWq4', 'The PERFECT Machine Hip Thrust', 'DeltaBolic'),
('calf raise', 'PLmYFSagwms', 'Best Way to do Calf Raises for Bigger Calves', 'TylerPath'),
('plank', 'xe2MXatLTUw', '✅ The PERFECT Plank', 'DeltaBolic'),
('hanging leg raise', '8HEpX-4DmBQ', 'The Correct Way to do Hanging Leg Raises', 'TylerPath'),
('cable crunch', 'RQjrmGTbxjI', '❌ FIX Your Cable Crunch Mistakes!', 'DeltaBolic'),
('russian twist', 'GqVIYynuQy4', 'How to actually do Russian twists (pocket pickers) correctly for obliques', 'TylerPath'),
('treadmill', '5lL1nTzh8CU', 'The Best Way to Walk on a Treadmill (To Burn More Calories)', 'TylerPath'),
('cycling', '6Xp-d7daua0', 'Quick Tip 💪 Setting up the seat on a Stationary Bike', 'trainwell'),
('rowing machine', 'bCxq4zMHpzs', 'How to Use a Rowing Machine for Beginners (cardio)', 'All Strong Fitness'),
('elliptical', 'G1H_WKqifsc', 'How to do Cross trainer - Correct way!', 'Aparna Fitness'),
('stair climber', 'O6nPUisBba0', 'This Will Make Stair Master Better', 'TylerPath'),
('jump rope', 'XSY9AE72inM', 'Jump Rope Basics - Basic Bounce Tutorial', 'Lauren Jumps');

-- Planner catalog names (verified in migration 10)
insert into public.exercise_demos (name_key, video_id, video_title, video_creator)
select lower(btrim(name)), video_id, video_title, video_creator
from public.plan_exercises
where video_status = 'verified'
on conflict (name_key) do nothing;

-- Muscle group for planner exercises
update public.plan_exercises set primary_muscle = m.pm
from (values
  ('incline_db_press','chest'), ('machine_chest_press','chest'), ('low_incline_smith_press','chest'), ('low_to_high_cable_fly','chest'),
  ('chest_supported_row','back'), ('lat_pulldown','back'), ('assisted_pullup','back'), ('seated_cable_row','back'),
  ('lat_pulldown_wide','back'), ('one_arm_db_row','back'),
  ('cable_lateral_raise','shoulders'), ('seated_shoulder_press','shoulders'), ('db_lateral_raise','shoulders'),
  ('reverse_pec_deck','shoulders'), ('cable_db_lateral_raise','shoulders'), ('face_pull','shoulders'),
  ('incline_db_curl','biceps'), ('hammer_curl','biceps'), ('ez_cable_curl','biceps'),
  ('triceps_pushdown','triceps'), ('overhead_cable_triceps','triceps'), ('skull_crusher','triceps'),
  ('leg_press','quads'), ('leg_extension','quads'), ('db_split_squat','quads'),
  ('romanian_deadlift','hamstrings'), ('leg_curl','hamstrings'), ('seated_leg_curl','hamstrings'),
  ('hip_thrust','glutes'), ('leg_press_high_wide','glutes'), ('back_extension_45','glutes'),
  ('standing_calf_raise','calves'), ('seated_calf_raise','calves'),
  ('cable_crunch','core'), ('hanging_knee_raise','core'), ('pallof_press','core')
) as m(id, pm)
where plan_exercises.id = m.id;

-- Fill in a demo for any exercise saved without one (never overrides a demo the user chose).
create or replace function private.exercises_fill_demo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare d public.exercise_demos%rowtype;
begin
  if new.video_id is null then
    select * into d from public.exercise_demos where name_key = lower(btrim(new.name));
    if found then
      new.video_id := d.video_id;
      new.video_title := d.video_title;
      new.video_creator := d.video_creator;
    end if;
  end if;
  new.video_url := case when new.video_id is null then null else 'https://www.youtube.com/shorts/' || new.video_id end;
  return new;
end;
$$;
revoke all on function private.exercises_fill_demo() from public, anon, authenticated;
create trigger exercises_fill_demo before insert or update of name, video_id on public.exercises
  for each row execute function private.exercises_fill_demo();

-- Backfill existing exercises
update public.exercises e
   set video_id = d.video_id,
       video_url = 'https://www.youtube.com/shorts/' || d.video_id,
       video_title = d.video_title,
       video_creator = d.video_creator
  from public.exercise_demos d
 where e.video_id is null and d.name_key = lower(btrim(e.name));
