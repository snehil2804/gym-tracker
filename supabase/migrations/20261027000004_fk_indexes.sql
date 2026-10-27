-- Covering indexes for the composite (id, user_id) ownership foreign keys.
create index if not exists attendance_pkg_user_idx on public.attendance (pt_package_id, user_id);
create index if not exists goals_exercise_user_idx on public.goals (exercise_id, user_id);
create index if not exists pt_ledger_pkg_user_idx on public.pt_ledger (package_id, user_id);
create index if not exists pt_packages_renewed_user_idx on public.pt_packages (renewed_from_id, user_id);
create index if not exists pt_packages_trainer_user_idx on public.pt_packages (trainer_id, user_id);
create index if not exists pt_payments_pkg_user_idx on public.pt_payments (package_id, user_id);
create index if not exists schedule_blocks_pkg_user_idx on public.schedule_blocks (package_id, user_id);
create index if not exists workout_exercises_ex_user_idx on public.workout_exercises (exercise_id, user_id);
create index if not exists workout_exercises_user_idx on public.workout_exercises (user_id);
create index if not exists workout_exercises_wk_user_idx on public.workout_exercises (workout_id, user_id);
create index if not exists workout_sets_user_idx on public.workout_sets (user_id);
create index if not exists workout_sets_we_user_idx on public.workout_sets (workout_exercise_id, user_id);
drop index if exists public.pt_payments_package_idx;
drop index if exists public.pt_packages_trainer_idx;
drop index if exists public.attendance_package_idx;
