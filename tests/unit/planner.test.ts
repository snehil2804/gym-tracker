import { describe, expect, it } from "vitest";
import {
  blankDays,
  buildDefaultDays,
  changedFields,
  copyOfDefault,
  formatReps,
  formatRest,
  freeItem,
  moveItem,
  normaliseRir,
  rampExercises,
  validatePlan,
  workingSets,
  type TemplateDayRow,
  type TemplateItemRow,
} from "@/lib/domain/planner";

const days: TemplateDayRow[] = [
  { weekday: 1, title: "Upper A", focus: "Chest/back", is_rest: false },
  { weekday: 2, title: "Lower A", focus: "Quad/hinge", is_rest: false },
  { weekday: 6, title: "Rest day", focus: null, is_rest: true },
];
const item = (weekday: number, position: number, exercise_id: string, sets = 3): TemplateItemRow => ({
  weekday, position, exercise_id, sets, reps_min: 8, reps_max: 12, reps_unit: "", rir: "2", rest_min_s: 120, rest_max_s: 180, notes: null,
});
const items = [item(1, 2, "row"), item(1, 1, "press"), item(1, 3, "pulldown", 2), item(2, 1, "leg_press")];

describe("default plan", () => {
  it("builds all 7 days in order with exercises sorted by position", () => {
    const plan = buildDefaultDays(days, items);
    expect(plan).toHaveLength(7);
    expect(plan[0].items.map((i) => i.exerciseId)).toEqual(["press", "row", "pulldown"]);
    expect(plan[6]).toMatchObject({ weekday: 7, rest: true, items: [] });
    expect(workingSets(plan[0])).toBe(8);
  });

  it("applies custom sets/reps without touching the prescription", () => {
    const plan = buildDefaultDays(days, items, { "1:1": { sets: 4, reps: "10" } });
    const press = plan[0].items[0];
    expect(press.sets).toBe(3);
    expect(press.custom).toEqual({ sets: 4, reps: "10" });
    expect(workingSets(plan[0])).toBe(9); // custom sets count
  });

  it("ramp-up sets go on the first two exercises of lifting days only", () => {
    const plan = buildDefaultDays(days, items);
    expect(rampExercises(plan[0]).map((i) => i.exerciseId)).toEqual(["press", "row"]);
    expect(rampExercises(plan[5])).toEqual([]);
  });
});

describe("custom plans", () => {
  it("a copy of the default remembers the original values", () => {
    const copy = copyOfDefault(buildDefaultDays(days, items));
    const first = copy[0].items[0];
    expect(first.base).toMatchObject({ sets: 3, repsMin: 8, repsMax: 12 });
    expect(changedFields(first)).toEqual([]);
    expect(changedFields({ ...first, sets: 4, rir: "1" })).toEqual(["sets", "rir"]);
  });

  it("copies don't share objects with the default", () => {
    const def = buildDefaultDays(days, items);
    const copy = copyOfDefault(def);
    copy[0].items[0].sets = 9;
    expect(def[0].items[0].sets).toBe(3);
  });

  it("reorders items", () => {
    const list = buildDefaultDays(days, items)[0].items;
    expect(moveItem(list, 0, 2).map((i) => i.exerciseId)).toEqual(["row", "pulldown", "press"]);
    expect(moveItem(list, 0, -1)).toBe(list);
  });

  it("validates names, empty lifting days and ranges", () => {
    const d = blankDays();
    expect(validatePlan("", d)).toContain("Give the plan a name.");
    expect(validatePlan("Mine", d).some((e) => e.startsWith("Monday: add an exercise"))).toBe(true);
    d.forEach((x) => (x.rest = true));
    expect(validatePlan("Mine", d)).toEqual([]);
    d[0].rest = false;
    d[0].items = [{ ...freeItem("Push-ups"), repsMin: 12, repsMax: 8 }];
    expect(validatePlan("Mine", d)).toEqual(["Monday, exercise 1: rep range must be 1–100, low to high."]);
  });
});

describe("formatting", () => {
  it("formats reps, rest and RIR", () => {
    expect(formatReps(8, 12, "/leg")).toBe("8–12/leg");
    expect(formatReps(10, 10, "/side")).toBe("10/side");
    expect(formatRest(120, 180)).toBe("2–3 min");
    expect(formatRest(120, 120)).toBe("2 min");
    expect(formatRest(60, 90)).toBe("60–90 s");
    expect(normaliseRir("1 - 2")).toBe("1–2");
  });
});
