/**
 * Streak game for the calendar. Everything here is derived from attendance records, so editing a
 * day (e.g. confirming a missed one as attended) recomputes the whole game — nothing is stored.
 *
 * Rules
 * - A day is WON when you went to the gym or completed a PT session. Gym + PT on the same day is
 *   a "double" (bonus XP).
 * - REST days never break a streak: your rest weekdays (Sunday by default), days marked rest, and
 *   planned breaks. A trainer cancelling also doesn't count against you.
 * - A day is MISSED when it was a training day and you didn't go (gym absent), or you cancelled
 *   your own PT session without training. Misses break the streak and cost XP.
 * - A past training day with nothing logged is UNLOGGED: it stops the chain (log it to repair the
 *   streak) but costs no XP. Today is never held against you until it is over.
 * - A PERFECT MONTH is a finished month where every training day was won.
 */
import type { Attendance } from "../types";
import { addDays, endOfMonth, isoWeekday, startOfMonth, type ISODate } from "./dates";

export type GameDay = "won" | "double" | "rest" | "excused" | "missed" | "unlogged" | "pending" | "future" | "before";

export const XP = {
  win: 10,
  double: 5, // extra on top of a win when gym and PT both happened
  streakBonusCap: 10, // +1 per day of current streak, up to this
  miss: -15,
  chargedPT: -10, // extra when the missed day also cost a paid PT session
  perfectWeek: 25,
  perfectMonth: 100,
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

export interface GameInput {
  attendance: Attendance[];
  today: ISODate;
  /** First day the game counts; days before are "before". */
  start: ISODate;
  /** ISO weekdays that are rest days by default (7 = Sunday). */
  restDays?: number[];
  /** Planned breaks (vacation, sick, holiday) — protect the streak. */
  isBreak?: (date: ISODate) => boolean;
}

export interface MonthResult {
  month: string; // YYYY-MM
  trainingDays: number; // days that counted (won + missed + unlogged + pending-to-come)
  won: number;
  missed: number;
  unlogged: number;
  complete: boolean; // the month is over
  perfect: boolean; // complete and every training day won
  stillPerfect: boolean; // nothing missed or unlogged so far
}

export interface Badge {
  id: string;
  label: string;
  hint: string;
  earned: boolean;
}

export interface GameState {
  days: Map<ISODate, GameDay>;
  /** Days that sit inside a chain of ≥ 2 wins (rest days inside a chain included) → their run id. */
  chain: Map<ISODate, number>;
  streak: number; // current
  best: number;
  xp: number;
  level: { n: number; title: string; from: number; to: number | null; progress: number };
  months: Map<string, MonthResult>;
  badges: Badge[];
  lastBreak: { date: ISODate; lost: number; xp: number } | null;
  totals: { won: number; doubles: number; missed: number };
  /** Today still needs a session to extend the streak. */
  todayOpen: boolean;
}

export function classifyGameDay(date: ISODate, rec: Attendance | undefined, input: GameInput): GameDay {
  if (date < input.start) return "before";
  if (date > input.today) return "future";
  const gym = rec?.gym_status === "attended";
  const pt = rec?.pt_status === "completed";
  if (gym && pt) return "double";
  if (gym || pt) return "won";
  if (rec?.gym_status === "rest" || input.isBreak?.(date)) return "rest";
  if (rec?.pt_status === "trainer_cancelled" || rec?.pt_status === "rescheduled") return "excused";
  if (rec?.gym_status === "absent" || rec?.pt_status === "client_cancelled" || rec?.pt_status === "chargeable_absence") return "missed";
  if ((input.restDays ?? [7]).includes(isoWeekday(date))) return "rest";
  return date === input.today ? "pending" : "unlogged";
}

const isWin = (g: GameDay) => g === "won" || g === "double";
const isNeutral = (g: GameDay) => g === "rest" || g === "excused";

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
  let xp = 0;
  let run = 0;
  let best = 0;
  let runId = 0;
  let runDays: ISODate[] = []; // days of the current run, rest days included
  let runWins = 0;
  let lastBreak: GameState["lastBreak"] = null;
  const totals = { won: 0, doubles: 0, missed: 0 };
  let comeback = false;
  let afterMiss = false;
  let perfectWeeks = 0;
  let weekWins = 0;
  let weekBad = false;

  const closeRun = () => {
    if (runWins >= 2) {
      runId++;
      // trim trailing rest days so the trail ends on a win
      let end = runDays.length - 1;
      while (end >= 0 && !isWin(days.get(runDays[end])!)) end--;
      let startIdx = 0;
      while (startIdx <= end && !isWin(days.get(runDays[startIdx])!)) startIdx++;
      for (let i = startIdx; i <= end; i++) chain.set(runDays[i], runId);
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

  const first = input.start <= input.today ? input.start : input.today;
  for (let d = first; d <= input.today; d = addDays(d, 1)) {
    const g = classifyGameDay(d, byDate.get(d), input);
    days.set(d, g);
    const m = month(d);
    if (isWin(g)) {
      run++;
      runWins++;
      runDays.push(d);
      best = Math.max(best, run);
      totals.won++;
      if (g === "double") totals.doubles++;
      xp += XP.win + (g === "double" ? XP.double : 0) + Math.min(run - 1, XP.streakBonusCap);
      m.trainingDays++;
      m.won++;
      weekWins++;
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
      m.trainingDays++;
      m.missed++;
      m.stillPerfect = false;
      weekBad = true;
      afterMiss = true;
    } else if (g === "unlogged") {
      run = 0;
      closeRun();
      m.trainingDays++;
      m.unlogged++;
      m.stillPerfect = false;
      weekBad = true;
    }
    // pending (today) changes nothing yet

    // Sunday closes the ISO week: a perfect week has ≥ 1 win and no miss or unlogged day
    if (isoWeekday(d) === 7) {
      if (weekWins > 0 && !weekBad && addDays(d, -6) >= input.start) {
        perfectWeeks++;
        xp += XP.perfectWeek;
      }
      weekWins = 0;
      weekBad = false;
    }
    // last day of a finished month: award a perfect month
    if (d === endOfMonth(d) && d < input.today) {
      m.complete = true;
      m.perfect = m.stillPerfect && m.won > 0 && startOfMonth(d) >= input.start;
      if (m.perfect) xp += XP.perfectMonth;
    }
  }
  closeRun();

  // fill the rest of the current month's training days so "x of y" reads right
  const thisMonth = months.get(input.today.slice(0, 7));
  if (thisMonth) {
    for (let d = addDays(input.today, 1); d <= endOfMonth(input.today); d = addDays(d, 1)) {
      if (!(input.restDays ?? [7]).includes(isoWeekday(d)) && !input.isBreak?.(d)) thisMonth.trainingDays++;
    }
    if (days.get(input.today) === "pending") thisMonth.trainingDays++;
  }

  const anyPerfectMonth = [...months.values()].some((m) => m.perfect);
  const badges: Badge[] = [
    { id: "first", label: "First rep", hint: "Win your first day", earned: totals.won >= 1 },
    { id: "s3", label: "On fire", hint: "3-day streak", earned: best >= 3 },
    { id: "s7", label: "Week warrior", hint: "7-day streak", earned: best >= 7 },
    { id: "pw", label: "Perfect week", hint: "Win every training day of a week", earned: perfectWeeks > 0 },
    { id: "s14", label: "Unbreakable", hint: "14-day streak", earned: best >= 14 },
    { id: "double", label: "Double day", hint: "Gym and PT on the same day", earned: totals.doubles > 0 },
    { id: "comeback", label: "Comeback", hint: "Win the day after a miss", earned: comeback },
    { id: "pm", label: "Perfect month", hint: "Every training day of a month", earned: anyPerfectMonth },
    { id: "s30", label: "Iron will", hint: "30-day streak", earned: best >= 30 },
    { id: "d50", label: "Half century", hint: "50 days won", earned: totals.won >= 50 },
  ];

  return {
    days,
    chain,
    streak: run,
    best,
    xp,
    level: levelFor(xp),
    months,
    badges,
    lastBreak,
    totals,
    todayOpen: days.get(input.today) === "pending",
  };
}
