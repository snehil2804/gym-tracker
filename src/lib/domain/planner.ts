/**
 * Workout planner: the shared default plan (read-only, from the coaching PDF, Section C) and
 * private custom plans. Pure functions only — persistence lives in src/lib/data/planner.ts.
 *
 * A plan is always 7 days (ISO weekday 1 = Monday). Each lifting day lists items; each item has a
 * prescription (sets, rep range, RIR, rest). Custom sets/reps sit next to the prescription so the
 * original is never lost. Items copied from the default keep a `base` snapshot, so the UI can show
 * exactly which values were customised.
 */

export type RepsUnit = "" | "/leg" | "/arm" | "/side";

export interface Prescription {
  sets: number;
  repsMin: number;
  repsMax: number;
  repsUnit: RepsUnit;
  rir: string;
  restMin: number; // seconds
  restMax: number;
}

export interface PlanItem extends Prescription {
  key: string; // stable id within the plan
  exerciseId: string | null; // catalog id, or null for a free-text exercise
  name?: string; // free-text exercise name (when exerciseId is null)
  notes?: string | null;
  /** The default plan's prescription this item started from (custom plans only). */
  base?: Prescription | null;
  /** Your own target, kept separate from the prescription. */
  custom?: { sets?: number; reps?: string } | null;
}

export interface PlanDay {
  weekday: number;
  title: string;
  focus?: string | null;
  rest: boolean;
  items: PlanItem[];
}

export interface CatalogExercise {
  id: string;
  name: string;
  target_muscles: string[];
  equipment: string;
  instructions: string;
  video_id: string | null;
  video_url: string | null;
  video_title: string | null;
  video_creator: string | null;
  video_status: "verified" | "pending";
}

export interface TemplateDayRow {
  weekday: number;
  title: string;
  focus: string | null;
  is_rest: boolean;
}
export interface TemplateItemRow {
  weekday: number;
  position: number;
  exercise_id: string;
  sets: number;
  reps_min: number;
  reps_max: number;
  reps_unit: RepsUnit;
  rir: string;
  rest_min_s: number;
  rest_max_s: number;
  notes: string | null;
}

/** Custom sets/reps on the default plan, keyed by "<weekday>:<position>". */
export type DefaultOverrides = Record<string, { sets?: number; reps?: string }>;

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function defaultItemKey(weekday: number, position: number) {
  return `${weekday}:${position}`;
}

export function prescriptionOf(i: Prescription): Prescription {
  return { sets: i.sets, repsMin: i.repsMin, repsMax: i.repsMax, repsUnit: i.repsUnit, rir: i.rir, restMin: i.restMin, restMax: i.restMax };
}

/** The 7-day default plan from the shared template rows, with this user's custom sets/reps applied. */
export function buildDefaultDays(days: TemplateDayRow[], items: TemplateItemRow[], overrides: DefaultOverrides = {}): PlanDay[] {
  return [1, 2, 3, 4, 5, 6, 7].map((weekday) => {
    const d = days.find((x) => x.weekday === weekday);
    return {
      weekday,
      title: d?.title ?? "Rest day",
      focus: d?.focus ?? null,
      rest: d?.is_rest ?? true,
      items: items
        .filter((i) => i.weekday === weekday)
        .sort((a, b) => a.position - b.position)
        .map((i) => {
          const key = defaultItemKey(weekday, i.position);
          const o = overrides[key];
          return {
            key,
            exerciseId: i.exercise_id,
            sets: i.sets,
            repsMin: i.reps_min,
            repsMax: i.reps_max,
            repsUnit: i.reps_unit,
            rir: i.rir,
            restMin: i.rest_min_s,
            restMax: i.rest_max_s,
            notes: i.notes,
            custom: o && (o.sets !== undefined || o.reps !== undefined) ? o : null,
          };
        }),
    };
  });
}

let keySeq = 0;
export function newKey() {
  keySeq = (keySeq + 1) % 1e6;
  return `k${Date.now().toString(36)}${keySeq.toString(36)}`;
}

/** A custom plan that starts as a copy of the default (each item remembers its default values). */
export function copyOfDefault(days: PlanDay[]): PlanDay[] {
  return days.map((d) => ({
    ...d,
    items: d.items.map((i) => ({ ...i, key: newKey(), base: prescriptionOf(i), custom: i.custom ?? null })),
  }));
}

/** A blank 7-day custom plan (Mon–Fri lifting, weekend rest). */
export function blankDays(): PlanDay[] {
  return [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, title: weekday <= 5 ? `Day ${weekday}` : "Rest day", focus: null, rest: weekday > 5, items: [] }));
}

export function itemFromCatalog(ex: CatalogExercise, base?: Prescription | null): PlanItem {
  const p = base ?? { sets: 3, repsMin: 8, repsMax: 12, repsUnit: "" as RepsUnit, rir: "2", restMin: 90, restMax: 120 };
  return { key: newKey(), exerciseId: ex.id, ...p, notes: null, base: base ?? null, custom: null };
}

export function freeItem(name: string): PlanItem {
  return { key: newKey(), exerciseId: null, name: name.trim(), sets: 3, repsMin: 8, repsMax: 12, repsUnit: "", rir: "2", restMin: 90, restMax: 120, notes: null, base: null, custom: null };
}

export function moveItem(items: PlanItem[], from: number, to: number): PlanItem[] {
  if (to < 0 || to >= items.length || from === to) return items;
  const next = [...items];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

/** Which prescription fields differ from where the item started (custom plans). */
export function changedFields(i: PlanItem): (keyof Prescription)[] {
  if (!i.base) return [];
  return (Object.keys(i.base) as (keyof Prescription)[]).filter((k) => i.base![k] !== i[k]);
}

export function formatReps(min: number, max: number, unit: RepsUnit = "") {
  return `${min === max ? min : `${min}–${max}`}${unit}`;
}

export function formatRest(min: number, max: number) {
  const f = (s: number) => (s >= 120 && s % 60 === 0 ? `${s / 60}` : `${s}`);
  if (min >= 120 && max >= 120 && min % 60 === 0 && max % 60 === 0) return min === max ? `${min / 60} min` : `${f(min)}–${f(max)} min`;
  return min === max ? `${min} s` : `${min}–${max} s`;
}

/** Hard (working) sets on a day. Warm-up and ramp-up sets never count. */
export function workingSets(day: PlanDay) {
  return day.items.reduce((n, i) => n + (i.custom?.sets ?? i.sets), 0);
}

export function dayLabel(day: PlanDay) {
  return day.rest ? "Rest from lifting" : `${day.items.length} exercises · ${workingSets(day)} working sets`;
}

/** Custom reps: "8", "8-12", "10/side" etc. — 1–40 chars of digits, dashes, slashes, letters. */
export function validCustomReps(s: string) {
  return /^[0-9][0-9 –\-/a-z]{0,39}$/i.test(s.trim());
}

/** Returns human-readable problems with a plan, or [] when it can be saved. */
export function validatePlan(name: string, days: PlanDay[]): string[] {
  const errors: string[] = [];
  if (!name.trim()) errors.push("Give the plan a name.");
  if (name.trim().length > 60) errors.push("Plan names can be up to 60 characters.");
  if (days.length !== 7) errors.push("A plan needs all 7 days.");
  for (const d of days) {
    const day = WEEKDAYS[d.weekday - 1];
    if (!d.title.trim()) errors.push(`${day}: add a title.`);
    if (!d.rest && d.items.length === 0) errors.push(`${day}: add an exercise or mark it as a rest day.`);
    if (d.items.length > 20) errors.push(`${day}: up to 20 exercises.`);
    d.items.forEach((i, n) => {
      const where = `${day}, exercise ${n + 1}`;
      if (!i.exerciseId && !i.name?.trim()) errors.push(`${where}: missing a name.`);
      if (!(i.sets >= 1 && i.sets <= 10)) errors.push(`${where}: sets must be 1–10.`);
      if (!(i.repsMin >= 1 && i.repsMax <= 100 && i.repsMin <= i.repsMax)) errors.push(`${where}: rep range must be 1–100, low to high.`);
      if (!/^[0-5](–[0-5])?$/.test(i.rir)) errors.push(`${where}: RIR must be 0–5 or a range like 1–2.`);
      if (!(i.restMin >= 0 && i.restMax <= 600 && i.restMin <= i.restMax)) errors.push(`${where}: rest must be 0–600 s, low to high.`);
      if (i.custom?.sets !== undefined && !(i.custom.sets >= 1 && i.custom.sets <= 10)) errors.push(`${where}: custom sets must be 1–10.`);
      if (i.custom?.reps !== undefined && !validCustomReps(i.custom.reps)) errors.push(`${where}: custom reps look wrong (e.g. 10 or 8–10).`);
    });
  }
  return errors;
}

/** Normalise RIR input: "1-2" → "1–2". */
export function normaliseRir(s: string) {
  return s.trim().replace(/\s*-\s*/, "–");
}

/** Strip runtime-only noise before saving or comparing. */
export function serialisePlan(days: PlanDay[]) {
  return JSON.stringify(days);
}

// ---------------------------------------------------------------------------
// Sections E–H of the PDF (the same for everyone; no week selection)
// ---------------------------------------------------------------------------

/** Section E — default cardio (Weeks 5–12 prescription). */
export const CARDIO = {
  activities: ["Incline treadmill walk", "Stationary bike"],
  sessionsPerWeek: 3,
  minutes: { min: 20, max: 30 },
  intensity: "Zone 2 — you can speak in full sentences (~60–70% of max HR, about 120–140 bpm)",
  timing: "After lifting on Monday and Thursday; third session on Saturday or Wednesday",
  rules: [
    "Keep dedicated cardio at about 150 min a week or less — steps do most of the energy-expenditure work.",
    "Don't use cardio as punishment for weekend eating.",
    "Prefer bike or incline walking over running.",
    "If your lower-body lifts stall, cut cardio duration first before cutting food further.",
  ],
};
export const DEFAULT_CARDIO_DAYS = [1, 4, 6];

/** Section F — steps / NEAT. */
export const STEPS = {
  defaultTarget: 9000,
  progression: [
    "Baseline: track your normal steps for 7 days (phone or band).",
    "Then add about 2,000 to your baseline.",
    "Add about 1,000 a day every 1–2 weeks until you reach 8,000, then 9,000–10,000. Hold there.",
    "If fat loss stalls later, adding 1,500–2,000 steps is a gentler lever than cutting more food.",
  ],
};
export const NEAT_CHECKLIST = [
  { id: "desk", label: "Worked at a desk and chair, not on the bed", hint: "Laptop stand and external keyboard if possible" },
  { id: "breaks", label: "Movement break every 45–60 min", hint: "3–5 min: walk around, stairs, 10 bodyweight squats or a wall-slide set" },
  { id: "calls", label: "Took calls standing or walking", hint: "Whenever the camera isn't needed" },
  { id: "lunch_walk", label: "10–15 min walk after lunch", hint: "Also helps digestion" },
  { id: "dinner_walk", label: "10–15 min walk after dinner", hint: "Also helps digestion" },
  { id: "late_walk", label: "Easy 10-min walk before winding down (if below target)", hint: "After 10 PM, only if you're short on steps" },
];

/** Section G — warm-up (8–10 min, before every lifting session). */
export const WARMUP = {
  general: { id: "general", label: "General — 4–5 min easy bike or incline walk" },
  dynamic: [
    { id: "arm_circles", label: "Arm circles", dose: "10/direction" },
    { id: "band_pull_aparts", label: "Band pull-aparts", dose: "×15" },
    { id: "cat_camel", label: "Cat–camel", dose: "×8" },
    { id: "bw_squats", label: "Bodyweight squats", dose: "×10" },
    { id: "hip_hinge", label: "Hip-hinge drill with a dowel", dose: "×10" },
    { id: "glute_bridge", label: "Glute bridge", dose: "×10" },
  ],
  ramp: [
    { pct: 50, reps: "10" },
    { pct: 70, reps: "5–6" },
    { pct: 85, reps: "2–3" },
  ],
  rampNote: "Ramp-up sets for the first 1–2 exercises only. They are warm-ups and don't count as working sets. Later exercises need one light “feeler” set at most.",
  coolDown: "Optional: 5 min easy walk or the posture routine.",
};

/** The first two exercises of a lifting day get ramp-up sets. */
export function rampExercises(day: PlanDay) {
  return day.rest ? [] : day.items.slice(0, 2);
}

/** Section H — posture/mobility routine (10 min; daily, or after sessions and on rest days). */
export const MOBILITY = [
  { id: "thoracic_ext", label: "Foam-roller thoracic extension", dose: "2 × 8 slow reps", purpose: "Upper-back mobility" },
  { id: "open_book", label: "Side-lying open book", dose: "8/side", purpose: "Thoracic rotation" },
  { id: "wall_slides", label: "Wall slides (forearms on the wall)", dose: "2 × 10", purpose: "Scapular upward rotation/control" },
  { id: "pull_aparts", label: "Band pull-aparts", dose: "2 × 15–20", purpose: "Rear delts and mid-traps" },
  { id: "chin_tucks", label: "Chin tucks (supine or against a wall)", dose: "10 × 3 s hold", purpose: "Neck positioning after laptop time" },
  { id: "hip_flexor", label: "Half-kneeling hip-flexor stretch (glute squeezed)", dose: "30–45 s/side", purpose: "Hip extension, offsetting long sitting" },
  { id: "hip_switch", label: "90/90 hip switches", dose: "8/side", purpose: "Hip rotation" },
  { id: "dead_bug", label: "Dead bug", dose: "2 × 8/side", purpose: "Core bracing with the ribs down" },
  { id: "side_plank", label: "Side plank", dose: "2 × 20–40 s/side", purpose: "Lateral core" },
];
export const MOBILITY_NOTE =
  "Not a treatment for any postural “disorder”. It builds upper-back strength, thoracic mobility and bracing. The best posture is your next posture — change positions often.";

/** Fraction done (0–1) of a checklist. */
export function progress(done: string[] | undefined, all: { id: string }[]) {
  if (!all.length) return 0;
  const set = new Set(done ?? []);
  return all.filter((x) => set.has(x.id)).length / all.length;
}
