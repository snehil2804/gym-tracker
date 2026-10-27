import type { Attendance, GymStatus, PtStatus, ScheduleBlock } from "../types";
import { isoWeekday, type ISODate } from "./dates";

export const GYM_STATUS: Record<GymStatus, { label: string; short: string }> = {
  attended: { label: "Went to the gym", short: "Attended" },
  absent: { label: "Missed the gym", short: "Missed" },
  rest: { label: "Rest day", short: "Rest" },
  unverified: { label: "Not confirmed", short: "Unconfirmed" },
};

export const PT_STATUS: Record<
  PtStatus,
  { label: string; short: string; help: string; consumes: boolean }
> = {
  completed: {
    label: "PT session completed",
    short: "PT done",
    help: "Uses 1 session from the package.",
    consumes: true,
  },
  chargeable_absence: {
    label: "Missed PT — chargeable",
    short: "PT missed (charged)",
    help: "Confirmed that the session was forfeited. Uses 1 session and counts as missed value.",
    consumes: true,
  },
  missed_unconfirmed: {
    label: "Missed PT — not sure if charged",
    short: "PT missed (unconfirmed)",
    help: "Recorded, but it does not touch the balance until you confirm whether it was charged.",
    consumes: false,
  },
  trainer_cancelled: {
    label: "Trainer cancelled",
    short: "Trainer cancelled",
    help: "Not your loss. The session stays in your balance.",
    consumes: false,
  },
  client_cancelled: {
    label: "I cancelled",
    short: "I cancelled",
    help: "You called off the session. Not deducted — if your trainer still charged it, choose “Missed PT — chargeable” instead.",
    consumes: false,
  },
  rescheduled: {
    label: "Rescheduled",
    short: "Rescheduled",
    help: "Moved to another day. Only the make-up session will use a session.",
    consumes: false,
  },
  not_scheduled: {
    label: "No PT scheduled",
    short: "No PT",
    help: "No session was planned for this day.",
    consumes: false,
  },
  unverified: {
    label: "PT not confirmed",
    short: "PT unconfirmed",
    help: "Unknown. Never counted as completed or missed.",
    consumes: false,
  },
};

export const ABSENCE_REASONS = [
  { value: "work", label: "Work" },
  { value: "illness", label: "Illness" },
  { value: "travel", label: "Travel" },
  { value: "tired", label: "Tired" },
  { value: "personal", label: "Personal" },
  { value: "other", label: "Other" },
] as const;

export function ptConsumesSession(s: PtStatus) {
  return PT_STATUS[s].consumes;
}

/** Sundays are rest days by default. */
export const DEFAULT_REST_DAYS = [7];

export type DayKind =
  | "trained" // gym + PT completed
  | "pt_only" // PT completed, gym not marked attended
  | "gym_only" // went to the gym without PT
  | "charged" // confirmed chargeable PT absence
  | "missed" // missed the gym, no PT at stake
  | "missed_unconfirmed" // missed the gym, PT outcome not confirmed
  | "cancelled" // trainer cancelled
  | "self_cancelled" // you cancelled
  | "rescheduled"
  | "rest"
  | "unverified" // past day, nothing confirmed
  | "not_scheduled" // past non-training day without a record
  | "future"
  | "before"; // before tracking started

export const DAY_KIND: Record<DayKind, { label: string; tone: string }> = {
  trained: { label: "Gym + PT done", tone: "good" },
  pt_only: { label: "PT done", tone: "good" },
  gym_only: { label: "Gym, no PT", tone: "good-soft" },
  charged: { label: "PT missed (charged)", tone: "loss" },
  missed: { label: "Missed gym", tone: "warn" },
  missed_unconfirmed: { label: "Missed · PT unconfirmed", tone: "warn" },
  cancelled: { label: "Trainer cancelled", tone: "info" },
  self_cancelled: { label: "I cancelled", tone: "neutral" },
  rescheduled: { label: "Rescheduled", tone: "violet" },
  rest: { label: "Rest day", tone: "rest" },
  unverified: { label: "Not confirmed", tone: "unknown" },
  not_scheduled: { label: "No PT scheduled", tone: "none" },
  future: { label: "Upcoming", tone: "none" },
  before: { label: "Before tracking", tone: "none" },
};

export interface DayContext {
  today: ISODate;
  trackingStart: ISODate | null;
  scheduleDays: number[]; // ISO weekdays with planned PT
  /** ISO weekdays that are rest days unless something else is logged (default: Sunday). */
  restDays?: number[];
}

export function isScheduledDay(date: ISODate, scheduleDays: number[]) {
  return scheduleDays.includes(isoWeekday(date));
}

export function classifyDay(date: ISODate, rec: Attendance | undefined, ctx: DayContext): DayKind {
  if (rec) {
    switch (rec.pt_status) {
      case "completed":
        return rec.gym_status === "attended" ? "trained" : "pt_only";
      case "chargeable_absence":
        return "charged";
      case "trainer_cancelled":
        return "cancelled";
      case "client_cancelled":
        return "self_cancelled";
      case "rescheduled":
        return "rescheduled";
    }
    if (rec.gym_status === "rest") return "rest";
    if (rec.gym_status === "attended") return "gym_only";
    if (rec.gym_status === "absent") {
      const ptOpen = rec.pt_status === "unverified" || rec.pt_status === "missed_unconfirmed";
      return ptOpen && isScheduledDay(date, ctx.scheduleDays) ? "missed_unconfirmed" : "missed";
    }
    if (rec.pt_status === "not_scheduled") return "not_scheduled";
    if (date > ctx.today) return "future";
    return "unverified";
  }
  if (ctx.trackingStart && date < ctx.trackingStart) return "before";
  if ((ctx.restDays ?? DEFAULT_REST_DAYS).includes(isoWeekday(date))) return "rest";
  if (date > ctx.today) return "future";
  return isScheduledDay(date, ctx.scheduleDays) ? "unverified" : "not_scheduled";
}

/**
 * A past (or current) day still needs the user's confirmation when a PT
 * session was planned and its outcome is unknown, or nothing at all was logged.
 */
export function needsReview(date: ISODate, rec: Attendance | undefined, ctx: DayContext): boolean {
  if (date > ctx.today) return false;
  if (ctx.trackingStart && date < ctx.trackingStart) return false;
  const scheduled = isScheduledDay(date, ctx.scheduleDays);
  if (!rec) return scheduled && !(ctx.restDays ?? DEFAULT_REST_DAYS).includes(isoWeekday(date));
  if (rec.gym_status === "rest") return false;
  if (rec.pt_status === "missed_unconfirmed") return true;
  if (rec.pt_status === "unverified") return scheduled || rec.gym_status === "unverified";
  return false;
}

export function blocksOn(date: ISODate, blocks: ScheduleBlock[], packageId?: string | null) {
  return blocks.filter(
    (b) =>
      b.start_date <= date &&
      date <= b.end_date &&
      (b.kind !== "pause" || !b.package_id || !packageId || b.package_id === packageId),
  );
}

export const BLOCK_KIND: Record<ScheduleBlock["kind"], string> = {
  vacation: "Vacation",
  rest: "Planned rest",
  trainer_unavailable: "Trainer unavailable",
  holiday: "Public holiday",
  pause: "Package paused",
};

/**
 * First name from the profile's display name, only when it looks like a real name
 * ("Snehil Rai" → "Snehil"). Email-style defaults ("snehilrai678.sr") return null.
 */
export function firstName(displayName: string | null | undefined): string | null {
  const first = (displayName ?? "").trim().split(/\s+/)[0] ?? "";
  if (!/^\p{L}[\p{L}'’-]*$/u.test(first)) return null;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/** "Snehil cancelled" when the profile has a real name, otherwise "I cancelled". */
export function selfCancelledLabel(displayName: string | null | undefined) {
  const n = firstName(displayName);
  return n ? `${n} cancelled` : "I cancelled";
}
