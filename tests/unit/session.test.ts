import { describe, expect, it } from "vitest";
import { cleanSets, itemStatuses, lastSets, sessionWorkout, setsByGroup, SKIPPED, volume, weeklyLoad } from "@/lib/domain/session";
import type { PlanItem } from "@/lib/domain/planner";
import type { Workout } from "@/lib/types";

const item = (key: string): PlanItem => ({ key, exerciseId: key, sets: 3, repsMin: 8, repsMax: 12, repsUnit: "", rir: "2", restMin: 60, restMax: 90 });
const workout = (date: string, type: string | null, exercises: { id: string; notes?: string | null; sets: [number | null, number | null, boolean?][] }[]): Workout =>
  ({
    id: `w-${date}-${type}`,
    workout_date: date,
    workout_type: type,
    exercises: exercises.map((e, i) => ({
      id: `we${i}`,
      exercise_id: e.id,
      position: i,
      rest_seconds: null,
      notes: e.notes ?? null,
      sets: e.sets.map(([weight_kg, reps, is_warmup], n) => ({ id: `s${n}`, set_number: n + 1, reps, weight_kg, duration_sec: null, is_warmup: !!is_warmup })),
    })),
  }) as unknown as Workout;

describe("today's plan session", () => {
  const ws = [
    workout("2026-10-27", "plan", [
      { id: "press", sets: [[20, 10]] },
      { id: "row", notes: SKIPPED, sets: [] },
    ]),
    workout("2026-10-27", null, [{ id: "curl", sets: [[10, 12]] }]),
    workout("2026-10-20", "plan", [{ id: "pulldown", sets: [[30, 5, true], [40, 10], [40, 9]] }]),
  ];

  it("finds the plan workout for the day and the status of each exercise", () => {
    const s = sessionWorkout(ws, "2026-10-27");
    expect(s?.workout_type).toBe("plan");
    expect(itemStatuses([item("press"), item("row"), item("pulldown")], (i) => i.exerciseId, s)).toEqual(["done", "skipped", "pending"]);
    expect(itemStatuses([item("press")], () => null, s)).toEqual(["pending"]);
  });

  it("pre-fills from the last earlier session, ignoring warm-up sets", () => {
    expect(lastSets(ws, "pulldown", "2026-10-27")).toEqual([
      { weight: 40, reps: 10 },
      { weight: 40, reps: 9 },
    ]);
    expect(lastSets(ws, "pulldown", "2026-10-20")).toEqual([]);
  });

  it("validates typed sets", () => {
    expect(cleanSets([{ weight: "40", reps: "10" }, { weight: "", reps: "" }, { weight: "42,5", reps: "8" }])).toEqual({
      sets: [
        { weight_kg: 40, reps: 10 },
        { weight_kg: 42.5, reps: 8 },
      ],
    });
    expect(cleanSets([{ weight: "", reps: "" }])).toEqual({ error: "Enter the reps for at least one set." });
    expect(cleanSets([{ weight: "40", reps: "8.5" }])).toHaveProperty("error");
    expect(cleanSets([{ weight: "-1", reps: "8" }])).toHaveProperty("error");
    expect(cleanSets([{ weight: "", reps: "12" }])).toEqual({ sets: [{ weight_kg: null, reps: 12 }] });
    expect(volume([{ weight_kg: 40, reps: 10 }, { weight_kg: null, reps: 12 }])).toBe(400);
  });
});

describe("training analytics", () => {
  const withMuscle = (w: Workout, m: string) => ({ ...w, exercises: w.exercises.map((e) => ({ ...e, exercise: { id: e.exercise_id, name: e.exercise_id, primary_muscle: m, category: "strength" } })) }) as Workout;
  const ws = [
    withMuscle(workout("2026-10-27", "plan", [{ id: "press", sets: [[20, 10], [20, 8], [10, 10, true]] }, { id: "row", notes: SKIPPED, sets: [] }]), "chest"),
    withMuscle(workout("2026-10-21", null, [{ id: "squat", sets: [[60, 5]] }]), "quads"),
  ];
  it("sums sets, reps, volume and plan completion per week (warm-ups excluded)", () => {
    const weeks = weeklyLoad(ws, "2026-10-27", 2);
    expect(weeks).toEqual([
      { week: "2026-10-19", sets: 1, reps: 5, volume: 300, done: 0, skipped: 0 },
      { week: "2026-10-26", sets: 2, reps: 18, volume: 360, done: 1, skipped: 1 },
    ]);
  });
  it("counts working sets per muscle group", () => {
    expect(setsByGroup(ws, "2026-10-01", "2026-10-31", (m) => (m === "quads" ? "legs" : m))).toEqual([
      { group: "chest", sets: 2 },
      { group: "legs", sets: 1 },
    ]);
  });
});
