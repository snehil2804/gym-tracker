/**
 * Streak game for the calendar. Everything is derived from attendance records, so editing a day
 * (e.g. confirming a missed one as attended) recomputes the whole game — nothing is stored.
 *
 * Rules
 * - You commit to N training days a week (Settings → weekly goal). Rest weekdays (Sunday by
 *   default), days marked rest and planned breaks are never training days.
 * - A day is WON when you went to the gym or completed a PT session; gym + PT is a DOUBLE.
 * - Each week has `available − goal` FREE OFF-DAYS. The first misses or unlogged days of a week
 *   use them up and don't break anything ("skip"). After that, a miss breaks the streak and costs
 *   XP; an unlogged past day breaks the chain without a penalty (log it to repair the streak).
 *   A missed paid PT session is never free.
 * - A trainer cancelling or rescheduling is EXCUSED. Today never counts against you until it's over.
 * - A GOLDEN WEEK hits the goal with no breaks. A GOLDEN MONTH is a finished month with no breaks
 *   and every training day you committed to done.
 */
import type { Attendance } from "../types";
import { addDays, endOfMonth, isoWeekday, startOfMonth, startOfWeek, type ISODate } from "./dates";

export type GameDay = "won" | "double" | "rest" | "excused" | "skip" | "missed" | "unlogged" | "pending" | "future" | "before";

export const XP = {
  win: 10,
  double: 5, // extra on top of a win when gym and PT both happened
  streakBonusCap: 10, // +1 per day of current streak, up to this
  miss: -15,
  chargedPT: -10, // extra when the missed day also cost a paid PT session
  goldenWeek: 50,
  goldenMonth: 150,
} as const;

export const LEVELS = [
  { at: 0, title: "Rookie" },
  { at: 150, title: "Regular" },
  { at: 400, title: "Grinder" },
  { at: 800, title: "Iron" },
  { at: 1400, title: "Steel" },
  { at: 2200, title: "Titan" },
  { at: 3200, title: "Legend" },
] as const;

/** Flame tiers by day streak. */
export function flameTier(streak: number): "out" | "spark" | "fire" | "blaze" | "inferno" {
  return streak <= 0 ? "out" : streak < 3 ? "spark" : streak < 7 ? "fire" : streak < 14 ? "blaze" : "inferno";
}

export interface GameInput {
  attendance: Attendance[];
  today: ISODate;
  /** First day the game counts; days before are "before". */
  start: ISODate;
  /** Training days you commit to per week. Omitted = every available day. */
  weeklyGoal?: number;
  /** ISO weekdays that are rest days by default (7 = Sunday). */
  restDays?: number[];
  /** Planned breaks (vacation, sick, holiday) — protect the streak. */
  isBreak?: (date: ISODate) => boolean;
}

export interface WeekResult {
  start: ISODate; // Monday
  available: number; // training days in the week (within tracking)
  goal: number; // min(weekly goal, available)
  won: number;
  breaks: number; // misses / unlogged days beyond the free off-days
  complete: boolean; // Sunday has passed
  kept: boolean; // goal reached (so far)
  golden: boolean; // complete (or already locked in) with the goal reached and no breaks
}

export interface MonthResult {
  month: string; // YYYY-MM
  trainingDays: number; // committed days in the month (estimated for the current month)
  won: number;
  missed: number;
  unlogged: number;
  complete: boolean; // the month is over
  perfect: boolean; // golden month: complete, nothing broken, at least one win
  stillPerfect: boolean; // nothing broken so far
}

export interface Badge {
  id: string;
  label: string;
  hint: string;
  earned: boolean;
}

export interface GameState {
  days: Map<ISODate, GameDay>;
  /** Days inside a chain of ≥ 2 wins (neutral days inside a chain included) → run id. */
  chain: Map<ISODate, number>;
  weeks: Map<ISODate, WeekResult>;
  streak: number;
  best: number;
  weekStreak: number; // golden weeks in a row (this week counts once it's locked in)
  bestWeekStreak: number;
  xp: number;
  level: { n: number; title: string; from: number; to: number | null; progress: number };
  months: Map<string, MonthResult>;
  badges: Badge[];
  lastBreak: { date: ISODate; lost: number; xp: number } | null;
  totals: { won: number; doubles: number; missed: number; goldenWeeks: number; goldenMonths: number };
  todayOpen: boolean;
  /** XP waiting for you if you train today. */
  todayXp: number;
  thisWeek: WeekResult | undefined;
}

export function classifyGameDay(date: ISODate, rec: Attendance | undefined, input: GameInput): GameDay {
  if (date < input.start) return "before";
  const gym = rec?.gym_status === "attended";
  const pt = rec?.pt_status === "completed";
  if (date > input.today) {
    if (rec?.gym_status === "rest" || input.isBreak?.(date) || (input.restDays ?? [7]).includes(isoWeekday(date))) return "rest";
    return "future";
  }
  if (gym && pt) return "double";
  if (gym || pt) return "won";
  if (rec?.gym_status === "rest" || input.isBreak?.(date)) return "rest";
  if (rec?.pt_status === "trainer_cancelled" || rec?.pt_status === "rescheduled") return "excused";
  if (rec?.gym_status === "absent" || rec?.pt_status === "client_cancelled" || rec?.pt_status === "chargeable_absence") return "missed";
  if ((input.restDays ?? [7]).includes(isoWeekday(date))) return "rest";
  return date === input.today ? "pending" : "unlogged";
}

const isWin = (g: GameDay) => g === "won" || g === "double";
const isNeutral = (g: GameDay) => g === "rest" || g === "excused" || g === "skip";
const isTrainingSlot = (g: GameDay) => g !== "rest" && g !== "excused" && g !== "before";

export function levelFor(xp: number) {
  let i = 0;
  while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1].at) i++;
  const from = LEVELS[i].at;
  const to = i + 1 < LEVELS.length ? LEVELS[i + 1].at : null;
  return { n: i + 1, title: LEVELS[i].title, from, to, progress: to === null ? 1 : (xp - from) / (to - from) };
}

export function computeGame(input: GameInput): GameState {
  const byDate = new Map(input.attendance.map((a) => [a.date, a]));
  const days = new Map<ISODate, GameDay>();
  const chain = new Map<ISODate, number>();
  const months = new Map<string, MonthResult>();
  const weeks = new Map<ISODate, WeekResult>();
  const first = input.start <= input.today ? input.start : input.today;

  // 1. Classify every day of every week we touch (to the end of this week), then size each week.
  const lastDay = addDays(startOfWeek(input.today), 6);
  for (let d = startOfWeek(first); d <= lastDay; d = addDays(d, 1)) days.set(d, classifyGameDay(d, byDate.get(d), input));
  for (let w = startOfWeek(first); w <= lastDay; w = addDays(w, 7)) {
    let available = 0;
    for (let i = 0; i < 7; i++) if (isTrainingSlot(days.get(addDays(w, i))!)) available++;
    const goal = Math.min(input.weeklyGoal ?? available, available);
    weeks.set(w, { start: w, available, goal, won: 0, breaks: 0, complete: addDays(w, 6) < input.today, kept: false, golden: false });
  }
  const freeLeft = new Map([...weeks.values()].map((w) => [w.start, w.available - w.goal]));

  let xp = 0;
  let run = 0;
  let best = 0;
  let runId = 0;
  let runDays: ISODate[] = [];
  let runWins = 0;
  let lastBreak: GameState["lastBreak"] = null;
  const totals = { won: 0, doubles: 0, missed: 0, goldenWeeks: 0, goldenMonths: 0 };
  let comeback = false;
  let afterMiss = false;
  let weekStreak = 0;
  let bestWeekStreak = 0;

  const closeRun = () => {
    if (runWins >= 2) {
      runId++;
      let end = runDays.length - 1;
      while (end >= 0 && !isWin(days.get(runDays[end])!)) end--;
      let s = 0;
      while (s <= end && !isWin(days.get(runDays[s])!)) s++;
      for (let i = s; i <= end; i++) chain.set(runDays[i], runId);
    }
    runDays = [];
    runWins = 0;
  };

  const month = (d: ISODate) => {
    const key = d.slice(0, 7);
    let m = months.get(key);
    if (!m) {
      m = { month: key, trainingDays: 0, won: 0, missed: 0, unlogged: 0, complete: endOfMonth(d) < input.today, perfect: false, stillPerfect: true };
      months.set(key, m);
    }
    return m;
  };

  // 2. Walk the days in order.
  for (let d = first; d <= input.today; d = addDays(d, 1)) {
    let g = days.get(d)!;
    const week = weeks.get(startOfWeek(d))!;
    const m = month(d);
    if ((g === "missed" || g === "unlogged") && byDate.get(d)?.pt_status !== "chargeable_absence" && (freeLeft.get(week.start) ?? 0) > 0) {
      freeLeft.set(week.start, freeLeft.get(week.start)! - 1);
      g = "skip";
      days.set(d, g);
    }
    if (isWin(g)) {
      run++;
      runWins++;
      runDays.push(d);
      best = Math.max(best, run);
      totals.won++;
      if (g === "double") totals.doubles++;
      xp += XP.win + (g === "double" ? XP.double : 0) + Math.min(run - 1, XP.streakBonusCap);
      week.won++;
      m.won++;
      if (afterMiss) comeback = true;
      afterMiss = false;
    } else if (isNeutral(g)) {
      if (run > 0) runDays.push(d);
    } else if (g === "missed") {
      const charged = byDate.get(d)?.pt_status === "chargeable_absence";
      const cost = XP.miss + (charged ? XP.chargedPT : 0);
      xp = Math.max(0, xp + cost);
      lastBreak = { date: d, lost: run, xp: cost };
      run = 0;
      closeRun();
      totals.missed++;
      week.breaks++;
      m.missed++;
      m.stillPerfect = false;
      afterMiss = true;
    } else if (g === "unlogged") {
      run = 0;
      closeRun();
      week.breaks++;
      m.unlogged++;
      m.stillPerfect = false;
    }

    // Sunday closes the week.
    if (isoWeekday(d) === 7 && d < input.today) {
      week.kept = week.won >= week.goal && week.goal > 0;
      week.golden = week.kept && week.breaks === 0 && week.start >= input.start;
      if (week.golden) {
        xp += XP.goldenWeek;
        totals.goldenWeeks++;
        weekStreak++;
        bestWeekStreak = Math.max(bestWeekStreak, weekStreak);
      } else if (week.goal > 0) {
        weekStreak = 0;
      }
    }
    // The last day of a finished month.
    if (d === endOfMonth(d) && d < input.today) {
      m.complete = true;
      m.perfect = m.stillPerfect && m.won > 0 && startOfMonth(d) >= input.start;
      if (m.perfect) {
        xp += XP.goldenMonth;
        totals.goldenMonths++;
      }
    }
  }
  closeRun();

  // 3. This week: locked in as golden as soon as the goal is reached with no breaks.
  const thisWeek = weeks.get(startOfWeek(input.today));
  if (thisWeek) {
    thisWeek.kept = thisWeek.goal > 0 && thisWeek.won >= thisWeek.goal;
    thisWeek.golden = thisWeek.kept && thisWeek.breaks === 0;
    if (thisWeek.golden) bestWeekStreak = Math.max(bestWeekStreak, weekStreak + 1);
  }
  const shownWeekStreak = weekStreak + (thisWeek?.golden ? 1 : 0);

  // Committed days this month (past weeks' goals + this week's goal), for "x of y".
  const thisMonth = months.get(input.today.slice(0, 7));
  if (thisMonth) {
    let committed = 0;
    for (const w of weeks.values()) {
      if (w.goal === 0) continue;
      // share of the week's goal that falls in this month
      let inMonth = 0;
      for (let i = 0; i < 7; i++) {
        const day = addDays(w.start, i);
        if (day.startsWith(thisMonth.month) && isTrainingSlot(days.get(day)!)) inMonth++;
      }
      if (inMonth) committed += Math.round((w.goal * inMonth) / w.available);
    }
    thisMonth.trainingDays = Math.max(committed, thisMonth.won);
  }
  for (const m of months.values()) if (m !== thisMonth) m.trainingDays = Math.max(m.trainingDays, m.won + m.missed + m.unlogged);

  const todayOpen = days.get(input.today) === "pending";
  const badges: Badge[] = [
    { id: "first", label: "First rep", hint: "Win your first day", earned: totals.won >= 1 },
    { id: "s3", label: "On fire", hint: "3-day streak", earned: best >= 3 },
    { id: "gw", label: "Golden week", hint: "Hit your weekly goal with no misses", earned: totals.goldenWeeks > 0 },
    { id: "s7", label: "Week warrior", hint: "7-day streak", earned: best >= 7 },
    { id: "double", label: "Double day", hint: "Gym and PT on the same day", earned: totals.doubles > 0 },
    { id: "comeback", label: "Comeback", hint: "Win the day after a miss", earned: comeback },
    { id: "s14", label: "Unbreakable", hint: "14-day streak", earned: best >= 14 },
    { id: "w4", label: "Gold rush", hint: "4 golden weeks in a row", earned: bestWeekStreak >= 4 },
    { id: "pm", label: "Golden month", hint: "Every committed day of a month", earned: totals.goldenMonths > 0 },
    { id: "s30", label: "Iron will", hint: "30-day streak", earned: best >= 30 },
    { id: "d50", label: "Half century", hint: "50 days won", earned: totals.won >= 50 },
    { id: "d100", label: "Centurion", hint: "100 days won", earned: totals.won >= 100 },
  ];

  return {
    days,
    chain,
    weeks,
    streak: run,
    best,
    weekStreak: shownWeekStreak,
    bestWeekStreak,
    xp,
    level: levelFor(xp),
    months,
    badges,
    lastBreak,
    totals,
    todayOpen,
    todayXp: todayOpen ? XP.win + Math.min(run, XP.streakBonusCap) : 0,
    thisWeek,
  };
}
