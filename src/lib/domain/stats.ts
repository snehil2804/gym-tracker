import type { Attendance, Workout } from "../types";
import { addDays, endOfMonth, isoWeekday, startOfMonth, startOfWeek, type ISODate } from "./dates";

export function inRange(d: ISODate, from: ISODate, to: ISODate) {
  return d >= from && d <= to;
}

export function workoutsBetween(workouts: Workout[], from: ISODate, to: ISODate) {
  return workouts.filter((w) => inRange(w.workout_date, from, to));
}

/** Distinct days with a workout or a confirmed gym visit — a "training day". */
export function trainingDays(workouts: Workout[], attendance: Attendance[], from: ISODate, to: ISODate): Set<ISODate> {
  const days = new Set<ISODate>();
  for (const w of workouts) if (inRange(w.workout_date, from, to)) days.add(w.workout_date);
  for (const a of attendance)
    if (inRange(a.date, from, to) && (a.gym_status === "attended" || a.pt_status === "completed")) days.add(a.date);
  return days;
}

export interface AttendanceRate {
  attended: number;
  missed: number;
  unverified: number;
  /** attended / (attended + missed), null when nothing was confirmed. */
  rate: number | null;
}

/**
 * Gym attendance over a period. Only confirmed records count; rest days and
 * unknown days are excluded from the denominator (never treated as missed).
 */
export function gymAttendance(attendance: Attendance[], from: ISODate, to: ISODate): AttendanceRate {
  let attended = 0;
  let missed = 0;
  let unverified = 0;
  for (const a of attendance) {
    if (!inRange(a.date, from, to)) continue;
    if (a.gym_status === "attended" || a.pt_status === "completed") attended++;
    else if (a.gym_status === "absent") missed++;
    else if (a.gym_status === "unverified") unverified++;
  }
  const denom = attended + missed;
  return { attended, missed, unverified, rate: denom ? attended / denom : null };
}

/** PT attendance: completed / (completed + chargeable absences). */
export function ptAttendance(attendance: Attendance[], from: ISODate, to: ISODate) {
  let completed = 0;
  let charged = 0;
  for (const a of attendance) {
    if (!inRange(a.date, from, to)) continue;
    if (a.pt_status === "completed") completed++;
    if (a.pt_status === "chargeable_absence") charged++;
  }
  const denom = completed + charged;
  return { completed, charged, rate: denom ? completed / denom : null };
}

/**
 * Current streak of consecutive confirmed training days, counted back from today
 * (or yesterday if today is not logged yet). Rest days and days without planned
 * training (`skipDays`, e.g. Sundays) are skipped rather than breaking the streak;
 * any missed or unknown planned day ends it.
 */
export function currentStreak(attendance: Attendance[], today: ISODate, skipDays: number[] = [7]): number {
  const map = new Map(attendance.map((a) => [a.date, a]));
  let streak = 0;
  let d = today;
  const todayRec = map.get(today);
  const trained = (a?: Attendance) => !!a && (a.gym_status === "attended" || a.pt_status === "completed");
  if (!trained(todayRec)) d = addDays(today, -1);
  for (let i = 0; i < 400; i++, d = addDays(d, -1)) {
    const a = map.get(d);
    if (trained(a)) {
      streak++;
      continue;
    }
    if (a?.gym_status === "rest") continue;
    if (!a && skipDays.includes(isoWeekday(d))) continue;
    break;
  }
  return streak;
}

export function weekRange(today: ISODate) {
  const from = startOfWeek(today);
  return { from, to: addDays(from, 6) };
}
export function monthRange(today: ISODate) {
  return { from: startOfMonth(today), to: endOfMonth(today) };
}

/** Last `n` weeks (oldest first) with workout counts and confirmed gym days. */
export function weeklySeries(workouts: Workout[], attendance: Attendance[], today: ISODate, n = 12) {
  const thisWeek = startOfWeek(today);
  return Array.from({ length: n }, (_, i) => {
    const from = addDays(thisWeek, -7 * (n - 1 - i));
    const to = addDays(from, 6);
    const att = gymAttendance(attendance, from, to);
    const ws = workoutsBetween(workouts, from, to);
    return {
      week: from,
      workouts: ws.length,
      gymDays: att.attended,
      missed: att.missed,
      minutes: ws.reduce((s, w) => s + (w.duration_min ?? 0), 0),
    };
  });
}

// ---------------------------------------------------------------------------
// Strength
// ---------------------------------------------------------------------------

/** Epley estimated one-rep max. */
export function e1rm(weight: number, reps: number) {
  if (!weight || !reps) return 0;
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

export function workoutVolume(w: Workout) {
  let v = 0;
  for (const ex of w.exercises)
    for (const s of ex.sets) if (!s.is_warmup && s.weight_kg && s.reps) v += Number(s.weight_kg) * s.reps;
  return Math.round(v);
}

export interface ExercisePoint {
  date: ISODate;
  topWeight: number;
  topReps: number;
  bestE1rm: number;
  volume: number;
}

/** One point per workout day for an exercise, from saved workouts only. */
export function exerciseHistory(workouts: Workout[], exerciseId: string): ExercisePoint[] {
  const points: ExercisePoint[] = [];
  for (const w of [...workouts].sort((a, b) => (a.workout_date < b.workout_date ? -1 : 1))) {
    for (const ex of w.exercises) {
      if (ex.exercise_id !== exerciseId) continue;
      const work = ex.sets.filter((s) => !s.is_warmup && s.weight_kg != null);
      if (!work.length) continue;
      let top = work[0];
      for (const s of work) if (Number(s.weight_kg) > Number(top.weight_kg)) top = s;
      points.push({
        date: w.workout_date,
        topWeight: Number(top.weight_kg),
        topReps: top.reps ?? 0,
        bestE1rm: Math.round(Math.max(...work.map((s) => e1rm(Number(s.weight_kg), s.reps ?? 0))) * 10) / 10,
        volume: Math.round(work.reduce((t, s) => t + Number(s.weight_kg) * (s.reps ?? 0), 0)),
      });
    }
  }
  return points;
}

export interface PersonalRecord {
  exerciseId: string;
  name: string;
  weight: number;
  reps: number;
  date: ISODate;
  firstWeight: number;
  sessions: number;
}

export function personalRecords(workouts: Workout[]): PersonalRecord[] {
  const map = new Map<string, PersonalRecord>();
  const sorted = [...workouts].sort((a, b) => (a.workout_date < b.workout_date ? -1 : 1));
  for (const w of sorted) {
    for (const ex of w.exercises) {
      const sets = ex.sets.filter((s) => !s.is_warmup && s.weight_kg != null && Number(s.weight_kg) > 0);
      if (!sets.length || !ex.exercise) continue;
      const best = sets.reduce((a, b) => (Number(b.weight_kg) > Number(a.weight_kg) ? b : a));
      const cur = map.get(ex.exercise_id);
      if (!cur) {
        map.set(ex.exercise_id, {
          exerciseId: ex.exercise_id,
          name: ex.exercise.name,
          weight: Number(best.weight_kg),
          reps: best.reps ?? 0,
          date: w.workout_date,
          firstWeight: Number(best.weight_kg),
          sessions: 1,
        });
      } else {
        cur.sessions++;
        if (Number(best.weight_kg) > cur.weight) {
          cur.weight = Number(best.weight_kg);
          cur.reps = best.reps ?? 0;
          cur.date = w.workout_date;
        }
      }
    }
  }
  return [...map.values()].sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name));
}

export function muscleGroupCounts(workouts: Workout[]) {
  const counts = new Map<string, number>();
  for (const w of workouts) {
    const groups = new Set<string>(w.muscle_groups);
    for (const ex of w.exercises) if (ex.exercise?.primary_muscle) groups.add(ex.exercise.primary_muscle);
    for (const g of groups) counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  return [...counts.entries()].map(([group, count]) => ({ group, count })).sort((a, b) => b.count - a.count);
}
