/**
 * Logging today's planned workout from the Today page. The session is stored as an ordinary
 * workout (workout_type = 'plan') so History, Progress and PRs all use it unchanged.
 * Each plan exercise ends up done (has working sets), skipped (row with note "Skipped") or pending.
 */
import type { Workout } from "../types";
import type { PlanItem } from "./planner";

export const PLAN_WORKOUT_TYPE = "plan";
export const SKIPPED = "Skipped";

export type ItemStatus = "done" | "skipped" | "pending";

export interface LoggedSet {
  weight: string; // kg, as typed
  reps: string;
}

/** Today's plan session, if one was started. */
export function sessionWorkout(workouts: Workout[], date: string) {
  return workouts.find((w) => w.workout_date === date && w.workout_type === PLAN_WORKOUT_TYPE) ?? null;
}

/** Status of each plan item, given which user exercise each one maps to. */
export function itemStatuses(items: PlanItem[], exerciseIdFor: (i: PlanItem) => string | null, session: Workout | null): ItemStatus[] {
  return items.map((i) => {
    const id = exerciseIdFor(i);
    const row = id && session?.exercises.find((e) => e.exercise_id === id);
    if (!row) return "pending";
    if (row.sets.some((s) => !s.is_warmup && (s.reps ?? 0) > 0)) return "done";
    return row.notes === SKIPPED ? "skipped" : "pending";
  });
}

/** The working sets from the most recent earlier session of this exercise (to pre-fill). */
export function lastSets(workouts: Workout[], exerciseId: string, beforeDate: string): { weight: number | null; reps: number | null }[] {
  const past = workouts
    .filter((w) => w.workout_date < beforeDate)
    .sort((a, b) => (a.workout_date < b.workout_date ? 1 : -1));
  for (const w of past) {
    const row = w.exercises.find((e) => e.exercise_id === exerciseId);
    const sets = row?.sets.filter((s) => !s.is_warmup && s.reps != null) ?? [];
    if (sets.length) return sets.map((s) => ({ weight: s.weight_kg, reps: s.reps }));
  }
  return [];
}

/** Validates typed sets; returns the clean sets or an error message. */
export function cleanSets(sets: LoggedSet[]): { sets: { weight_kg: number | null; reps: number }[] } | { error: string } {
  const out: { weight_kg: number | null; reps: number }[] = [];
  for (const [n, s] of sets.entries()) {
    if (!s.reps.trim() && !s.weight.trim()) continue;
    const reps = Number(s.reps);
    if (!Number.isInteger(reps) || reps < 1 || reps > 1000) return { error: `Set ${n + 1}: reps must be a whole number from 1 to 1000.` };
    let weight: number | null = null;
    if (s.weight.trim()) {
      weight = Number(s.weight.replace(",", "."));
      if (!Number.isFinite(weight) || weight < 0 || weight > 1000) return { error: `Set ${n + 1}: weight must be 0–1000 kg.` };
      weight = Math.round(weight * 100) / 100;
    }
    out.push({ weight_kg: weight, reps });
  }
  if (!out.length) return { error: "Enter the reps for at least one set." };
  return { sets: out };
}

/** Total kg × reps for working sets. */
export function volume(sets: { weight_kg: number | null; reps: number | null }[]) {
  return sets.reduce((v, s) => v + (s.weight_kg ?? 0) * (s.reps ?? 0), 0);
}

/** Per-week training load from logged sets (last `n` ISO weeks, oldest first). */
export function weeklyLoad(workouts: Workout[], today: string, n = 12) {
  const start = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    const wd = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - wd);
    return d.toISOString().slice(0, 10);
  };
  const shift = (iso: string, days: number) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const thisWeek = start(today);
  return Array.from({ length: n }, (_, i) => {
    const from = shift(thisWeek, -7 * (n - 1 - i));
    const to = shift(from, 6);
    let sets = 0;
    let reps = 0;
    let kg = 0;
    let done = 0;
    let skipped = 0;
    for (const w of workouts) {
      if (w.workout_date < from || w.workout_date > to) continue;
      for (const e of w.exercises) {
        const working = e.sets.filter((s) => !s.is_warmup && (s.reps ?? 0) > 0);
        sets += working.length;
        reps += working.reduce((r, s) => r + (s.reps ?? 0), 0);
        kg += volume(working);
        if (w.workout_type === PLAN_WORKOUT_TYPE) {
          if (working.length) done++;
          else if (e.notes === SKIPPED) skipped++;
        }
      }
    }
    return { week: from, sets, reps, volume: Math.round(kg), done, skipped };
  });
}

/** Working sets per muscle group between two dates (inclusive), largest first. */
export function setsByGroup(workouts: Workout[], from: string, to: string, groupOfMuscle: (m: string) => string) {
  const out = new Map<string, number>();
  for (const w of workouts) {
    if (w.workout_date < from || w.workout_date > to) continue;
    for (const e of w.exercises) {
      const n = e.sets.filter((s) => !s.is_warmup && (s.reps ?? 0) > 0).length;
      if (!n) continue;
      const g = groupOfMuscle(e.exercise?.primary_muscle ?? "other");
      out.set(g, (out.get(g) ?? 0) + n);
    }
  }
  return [...out.entries()].map(([group, sets]) => ({ group, sets })).sort((a, b) => b.sets - a.sets);
}
