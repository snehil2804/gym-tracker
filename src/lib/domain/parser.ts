// Rule-based parser that turns a short free-text note into an editable workout
// draft. It never decides that a paid PT session happened on its own: it only
// *suggests* a completed PT session when the text says so explicitly
// ("<trainer> trained me", "PT session with <trainer>"), and the user must still
// confirm the draft before anything is saved.

import { addDays, isoWeekday, type ISODate } from "./dates";

export interface DraftSet {
  reps: number | null;
  weight_kg: number | null;
}
export interface DraftExercise {
  name: string;
  matched: boolean;
  sets: DraftSet[];
}
export interface WorkoutDraft {
  date: ISODate;
  dateSource: "default" | "explicit";
  attendance: "attended" | "absent" | null;
  trainer: string | null;
  /** 'completed' only for explicit statements. Never auto-applied. */
  ptSuggestion: "completed" | null;
  ptEvidence: string | null;
  durationMin: number | null;
  muscleGroups: string[];
  exercises: DraftExercise[];
  cardio: { type: string; minutes: number | null; distanceKm: number | null } | null;
  warnings: string[];
}

const MUSCLE_WORDS: Record<string, string[]> = {
  chest: ["chest", "pecs", "pec"],
  triceps: ["triceps", "tricep", "tris"],
  biceps: ["biceps", "bicep", "bis"],
  back: ["back", "lats", "lat"],
  shoulders: ["shoulders", "shoulder", "delts", "delt"],
  quads: ["quads", "quad"],
  hamstrings: ["hamstrings", "hamstring", "hams"],
  glutes: ["glutes", "glute"],
  calves: ["calves", "calf"],
  core: ["core", "abs", "ab"],
  cardio: ["cardio"],
};
const GROUP_PHRASES: Record<string, string[]> = {
  legs: ["quads", "hamstrings", "glutes", "calves"],
  arms: ["biceps", "triceps"],
  push: ["chest", "shoulders", "triceps"],
  pull: ["back", "biceps"],
  "full body": ["chest", "back", "quads", "shoulders", "core"],
  upper: ["chest", "back", "shoulders"],
};

/** Extra spellings that map onto library exercise names. */
const ALIASES: Record<string, string> = {
  bench: "Bench Press",
  "bench press": "Bench Press",
  "flat bench": "Bench Press",
  "incline bench": "Incline Bench Press",
  "incline press": "Incline Dumbbell Press",
  "incline db press": "Incline Dumbbell Press",
  "db press": "Dumbbell Bench Press",
  "cable fly": "Cable Fly",
  "cable flye": "Cable Fly",
  "cable flies": "Cable Fly",
  "cable flyes": "Cable Fly",
  flye: "Cable Fly",
  fly: "Cable Fly",
  "pec fly": "Pec Deck",
  "pec deck": "Pec Deck",
  pushdown: "Triceps Pushdown",
  "tricep pushdown": "Triceps Pushdown",
  "triceps pushdown": "Triceps Pushdown",
  "rope pushdown": "Triceps Pushdown",
  "overhead extension": "Overhead Triceps Extension",
  "skull crusher": "Skull Crusher",
  pulldown: "Lat Pulldown",
  "lat pulldown": "Lat Pulldown",
  "pull up": "Pull-up",
  pullup: "Pull-up",
  "chin up": "Pull-up",
  "cable row": "Seated Cable Row",
  "seated row": "Seated Cable Row",
  "barbell row": "Barbell Row",
  "bent over row": "Barbell Row",
  "dumbbell row": "Dumbbell Row",
  "db row": "Dumbbell Row",
  row: "Seated Cable Row",
  deadlift: "Deadlift",
  rdl: "Romanian Deadlift",
  "romanian deadlift": "Romanian Deadlift",
  squat: "Squat",
  "back squat": "Squat",
  "leg press": "Leg Press",
  "leg extension": "Leg Extension",
  "leg curl": "Leg Curl",
  "hamstring curl": "Leg Curl",
  lunge: "Walking Lunge",
  "calf raise": "Calf Raise",
  "hip thrust": "Hip Thrust",
  ohp: "Overhead Press",
  "overhead press": "Overhead Press",
  "military press": "Overhead Press",
  "shoulder press": "Dumbbell Shoulder Press",
  "lateral raise": "Lateral Raise",
  "side raise": "Lateral Raise",
  "front raise": "Front Raise",
  "rear delt": "Rear Delt Fly",
  "face pull": "Face Pull",
  shrug: "Shrug",
  curl: "Dumbbell Curl",
  "bicep curl": "Dumbbell Curl",
  "biceps curl": "Dumbbell Curl",
  "barbell curl": "Barbell Curl",
  "hammer curl": "Hammer Curl",
  "preacher curl": "Preacher Curl",
  plank: "Plank",
  crunch: "Cable Crunch",
  "leg raise": "Hanging Leg Raise",
  "push up": "Push-up",
  pushup: "Push-up",
  dip: "Chest Dip",
  treadmill: "Treadmill",
  run: "Treadmill",
  running: "Treadmill",
  cycling: "Cycling",
  cycle: "Cycling",
  bike: "Cycling",
  rowing: "Rowing Machine",
  elliptical: "Elliptical",
  "stair climber": "Stair Climber",
  stairmaster: "Stair Climber",
  "jump rope": "Jump Rope",
  skipping: "Jump Rope",
};

const CARDIO = new Set(["Treadmill", "Cycling", "Rowing Machine", "Elliptical", "Stair Climber", "Jump Rope"]);

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, "forty-five": 45, fifty: 50, sixty: 60, ninety: 90,
};

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** lowercase, unify punctuation, singularise simple plurals */
function normalise(s: string) {
  return s
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[-_/]/g, " ")
    .replace(/[^a-z0-9.@×x\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(singular)
    .join(" ");
}

function singular(w: string) {
  if (w.length <= 3 || /\d/.test(w)) return w;
  if (w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.endsWith("sses")) return w.slice(0, -2);
  if (/(ch|sh|x)es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us")) return w.slice(0, -1);
  return w;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseDate(text: string, today: ISODate): { date: ISODate; explicit: boolean } {
  const t = text.toLowerCase();
  if (/\byesterday\b/.test(t)) return { date: addDays(today, -1), explicit: true };
  if (/\bday before yesterday\b/.test(t)) return { date: addDays(today, -2), explicit: true };
  if (/\btoday\b|\bthis (morning|evening|afternoon)\b|\btonight\b/.test(t)) return { date: today, explicit: true };

  for (let i = 0; i < 7; i++) {
    const re = new RegExp(`\\b(?:on |last )?${WEEKDAYS[i]}\\b`);
    if (re.test(t)) {
      const target = i + 1;
      let back = (isoWeekday(today) - target + 7) % 7;
      if (back === 0 && /\blast\b/.test(t)) back = 7;
      return { date: addDays(today, -back), explicit: true };
    }
  }

  const year = Number(today.slice(0, 4));
  const dm = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/);
  const md = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
  const slash = t.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  let d: number | null = null;
  let m: number | null = null;
  let y = year;
  if (dm) {
    d = Number(dm[1]);
    m = MONTHS.indexOf(dm[2]) + 1;
  } else if (md) {
    d = Number(md[2]);
    m = MONTHS.indexOf(md[1]) + 1;
  } else if (slash) {
    d = Number(slash[1]); // Indian convention: day first
    m = Number(slash[2]);
    if (slash[3]) y = Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3]);
  }
  if (d && m && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
    const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    // A date later than today without an explicit year means last year.
    const fixed = !slash?.[3] && iso > today ? `${y - 1}${iso.slice(4)}` : iso;
    return { date: fixed, explicit: true };
  }
  return { date: today, explicit: false };
}

function parseDuration(t: string): number | null {
  const s = t.toLowerCase();
  if (/\b(an? )?hour and (a )?half\b|\b1\.5 ?(hours?|hrs?)\b|\bone and a half hours?\b/.test(s)) return 90;
  if (/\bhalf an hour\b/.test(s)) return 30;
  const toNum = (w: string) => (Number.isNaN(Number(w)) ? NUMBER_WORDS[w] : Number(w));
  let total = 0;
  let found = false;
  for (const h of s.matchAll(/\b(\d+(?:\.\d+)?|an?|one|two|three)\s*(?:hours?|hrs?|h)\b/g)) {
    const v = toNum(h[1]);
    if (v) {
      total += Math.round(v * 60);
      found = true;
      break;
    }
  }
  for (const m of s.matchAll(/\b(\d+|[a-z-]+)\s*(?:minutes?|mins?|min)\b|\b(\d+)m\b/g)) {
    const v = toNum(m[1] ?? m[2]);
    if (v && v < 600) {
      total += v;
      found = true;
      break;
    }
  }
  return found && total > 0 && total <= 600 ? total : null;
}

function parseSets(segment: string): DraftSet[] {
  const s = segment.toLowerCase().replace(/×/g, "x");
  const weightM = s.match(/(\d+(?:\.\d+)?)\s*(?:kg|kgs|kilos?)\b/) ?? s.match(/@\s*(\d+(?:\.\d+)?)/);
  const weight = weightM ? Number(weightM[1]) : null;

  let sets: number | null = null;
  let reps: number | null = null;
  const nx = s.match(/\b(\d{1,2})\s*x\s*(\d{1,3})\b/);
  const setsOf = s.match(/\b(\d{1,2}|[a-z]+)\s*sets?\s*(?:of\s*)?(\d{1,3})?/);
  const repsM = s.match(/\b(\d{1,3})\s*reps?\b/);
  if (nx) {
    sets = Number(nx[1]);
    reps = Number(nx[2]);
  } else {
    if (setsOf) sets = Number.isNaN(Number(setsOf[1])) ? NUMBER_WORDS[setsOf[1]] ?? null : Number(setsOf[1]);
    if (setsOf?.[2]) reps = Number(setsOf[2]);
    if (repsM) reps = Number(repsM[1]);
  }
  if (!sets && !reps && weight == null) return [];
  const n = Math.min(Math.max(sets ?? 1, 1), 20);
  return Array.from({ length: n }, () => ({ reps, weight_kg: weight }));
}

export interface ParseContext {
  today: ISODate;
  trainerNames: string[];
  exerciseNames: string[];
}

export function parseWorkoutText(text: string, ctx: ParseContext): WorkoutDraft {
  const warnings: string[] = [];
  const lower = text.toLowerCase();
  const norm = ` ${normalise(text)} `;
  const { date, explicit } = parseDate(text, ctx.today);

  // Attendance
  let attendance: WorkoutDraft["attendance"] = null;
  if (/\b(missed|skipped|didn'?t go|did not go|couldn'?t go|bunked)\b/.test(lower)) attendance = "absent";
  else if (/\b(went|go to the gym|at the gym|trained|worked out|workout|did|hit the gym|session)\b/.test(lower)) attendance = "attended";

  // Trainer & PT (explicit statements only)
  let trainer: string | null = null;
  let ptSuggestion: WorkoutDraft["ptSuggestion"] = null;
  let ptEvidence: string | null = null;
  for (const name of ctx.trainerNames) {
    const n = escapeRe(name.toLowerCase());
    if (!new RegExp(`\\b${n}\\b`).test(lower)) continue;
    trainer = name;
    const explicitPt = [
      new RegExp(`\\b${n}\\s+(?:trained|coached|took)\\s+me\\b`),
      new RegExp(`\\b(?:pt|personal training|training)\\s+(?:session\\s+)?with\\s+${n}\\b`),
      new RegExp(`\\bsession\\s+with\\s+${n}\\b`),
      new RegExp(`\\btrained\\s+with\\s+${n}\\b`),
      new RegExp(`\\b${n}\\s+(?:took|ran)\\s+(?:my|the)\\s+(?:pt\\s+)?session\\b`),
    ];
    const hit = explicitPt.map((re) => lower.match(re)).find(Boolean);
    const negated = new RegExp(`\\b(${n}\\s+(?:cancel|didn'?t|did not|was absent|wasn'?t)|without\\s+${n}|no pt)`).test(lower);
    if (hit && !negated && attendance !== "absent") {
      ptSuggestion = "completed";
      ptEvidence = hit[0];
    } else {
      warnings.push(`${name} is mentioned, but it isn't clear a PT session took place. Choose the PT status yourself.`);
    }
    break;
  }
  if (!trainer && /\b(pt|personal trainer|trainer)\b/.test(lower)) {
    warnings.push("A trainer is mentioned without a name. Choose the PT status yourself.");
  }

  // Muscle groups
  const muscles = new Set<string>();
  for (const [phrase, groups] of Object.entries(GROUP_PHRASES)) {
    if (new RegExp(`\\b${normalise(phrase)}\\b`).test(norm)) groups.forEach((g) => muscles.add(g));
  }
  for (const [group, words] of Object.entries(MUSCLE_WORDS)) {
    if (words.some((w) => new RegExp(`\\b${singular(w)}\\b`).test(norm))) muscles.add(group);
  }

  // Exercises: split into phrases and match the longest known name in each.
  const library = new Map<string, string>(); // normalised → display name
  for (const name of ctx.exerciseNames) library.set(normalise(name), name);
  for (const [alias, name] of Object.entries(ALIASES)) {
    const display = ctx.exerciseNames.find((n) => n.toLowerCase() === name.toLowerCase()) ?? name;
    library.set(normalise(alias), display);
  }
  const keys = [...library.keys()].sort((a, b) => b.length - a.length);

  const segments = text
    .split(/[,;\n]|\.(?!\d)|\band\b|\bthen\b|\bfollowed by\b/i)
    .map((s) => s.trim())
    .filter(Boolean);
  const exercises: DraftExercise[] = [];
  const seen = new Set<string>();
  for (const seg of segments) {
    const ns = ` ${normalise(seg)} `;
    const key = keys.find((k) => ns.includes(` ${k} `));
    if (!key) continue;
    const name = library.get(key)!;
    if (seen.has(name)) continue;
    seen.add(name);
    exercises.push({ name, matched: ctx.exerciseNames.some((n) => n === name), sets: parseSets(seg) });
  }

  // Cardio
  let cardio: WorkoutDraft["cardio"] = null;
  const cardioEx = exercises.find((e) => CARDIO.has(e.name));
  if (cardioEx) {
    const seg = segments.find((s) => normalise(s).includes(normalise(cardioEx.name).split(" ")[0])) ?? "";
    const dist = seg.toLowerCase().match(/(\d+(?:\.\d+)?)\s*(?:km|kms|kilometers?|kilometres?)\b/);
    cardio = { type: cardioEx.name, minutes: parseDuration(seg), distanceKm: dist ? Number(dist[1]) : null };
    muscles.add("cardio");
  }

  let durationText = text;
  if (cardioEx) {
    const key = normalise(cardioEx.name).split(" ")[0];
    for (const seg of segments) if (normalise(seg).includes(key)) durationText = durationText.replace(seg, " ");
  }
  const durationMin = parseDuration(durationText);

  if (!explicit) warnings.push("No date mentioned, so today is used.");
  if (exercises.length === 0 && muscles.size === 0 && attendance !== "absent") {
    warnings.push("No exercises recognised. Add them below or pick a template.");
  }

  return {
    date,
    dateSource: explicit ? "explicit" : "default",
    attendance,
    trainer,
    ptSuggestion,
    ptEvidence,
    durationMin,
    muscleGroups: [...muscles],
    exercises,
    cardio,
    warnings,
  };
}
