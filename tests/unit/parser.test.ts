import { describe, expect, it } from "vitest";
import { parseWorkoutText } from "@/lib/domain/parser";

const library = [
  "Bench Press", "Cable Fly", "Triceps Pushdown", "Lat Pulldown", "Squat", "Leg Press", "Treadmill", "Dumbbell Curl",
  "Overhead Press", "Incline Dumbbell Press",
];
const ctx = { today: "2026-10-26", trainerNames: ["Soham"], exerciseNames: library };

describe("natural-language workout parser", () => {
  it("parses the reference example", () => {
    const d = parseWorkoutText(
      "I went to the gym today. Trained chest and triceps. Soham trained me for one hour. Did bench press, cable fly and triceps pushdowns.",
      ctx,
    );
    expect(d.date).toBe("2026-10-26");
    expect(d.attendance).toBe("attended");
    expect(d.trainer).toBe("Soham");
    expect(d.ptSuggestion).toBe("completed");
    expect(d.durationMin).toBe(60);
    expect(d.muscleGroups).toEqual(expect.arrayContaining(["chest", "triceps"]));
    expect(d.exercises.map((e) => e.name)).toEqual(["Bench Press", "Cable Fly", "Triceps Pushdown"]);
  });

  it("never infers a paid PT session from ambiguous text", () => {
    const d = parseWorkoutText("Saw Soham at the gym, did legs", ctx);
    expect(d.ptSuggestion).toBeNull();
    expect(d.warnings.join(" ")).toMatch(/isn't clear/);
    expect(d.muscleGroups).toEqual(expect.arrayContaining(["quads", "hamstrings"]));
  });

  it("does not suggest PT when the trainer cancelled or the day was missed", () => {
    expect(parseWorkoutText("Soham cancelled today, did cardio alone", ctx).ptSuggestion).toBeNull();
    expect(parseWorkoutText("Missed the gym yesterday, Soham trained me last week", ctx).ptSuggestion).toBeNull();
    expect(parseWorkoutText("Missed the gym yesterday", ctx).attendance).toBe("absent");
  });

  it("reads sets, reps and weights", () => {
    const d = parseWorkoutText("bench press 3x10 at 30kg, lat pulldown 3 sets of 12 @ 45, squats 5 reps 60 kg", ctx);
    expect(d.exercises[0]).toEqual({ name: "Bench Press", matched: true, sets: Array(3).fill({ reps: 10, weight_kg: 30 }) });
    expect(d.exercises[1].sets).toHaveLength(3);
    expect(d.exercises[1].sets[0]).toEqual({ reps: 12, weight_kg: 45 });
    expect(d.exercises[2]).toMatchObject({ name: "Squat", sets: [{ reps: 5, weight_kg: 60 }] });
  });

  it("does not read decimal weights as dates", () => {
    const d = parseWorkoutText("cable fly 3x12 at 12.5 kg", ctx);
    expect(d.date).toBe("2026-10-26");
    expect(d.exercises[0].sets[0].weight_kg).toBe(12.5);
  });

  it("understands relative and explicit dates", () => {
    expect(parseWorkoutText("yesterday chest day", ctx).date).toBe("2026-10-25");
    expect(parseWorkoutText("on saturday did legs", ctx).date).toBe("2026-10-24");
    expect(parseWorkoutText("24 Oct back and biceps", ctx).date).toBe("2026-10-24");
    expect(parseWorkoutText("23/10 push day", ctx).date).toBe("2026-10-23");
    expect(parseWorkoutText("Dec 30 push day", ctx).date).toBe("2025-12-30");
  });

  it("captures durations and cardio", () => {
    expect(parseWorkoutText("45 min workout", ctx).durationMin).toBe(45);
    expect(parseWorkoutText("trained for an hour and a half", ctx).durationMin).toBe(90);
    const d = parseWorkoutText("treadmill 20 minutes 3 km", ctx);
    expect(d.cardio).toEqual({ type: "Treadmill", minutes: 20, distanceKm: 3 });
  });
});
