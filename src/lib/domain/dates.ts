// Calendar dates are plain 'YYYY-MM-DD' strings in the user's own calendar.
// Arithmetic is done in UTC on date-only values so that no time zone or DST
// shift can move a record to a different day.

export type ISODate = string;

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(s: unknown): s is ISODate {
  if (typeof s !== "string" || !ISO_RE.test(s)) return false;
  const d = toUTC(s);
  return !Number.isNaN(d.getTime()) && fromUTC(d) === s;
}

export function toUTC(iso: ISODate): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function fromUTC(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

/** Today's date in the given IANA time zone (default Asia/Kolkata). */
export function todayIn(timeZone = "Asia/Kolkata", now: Date = new Date()): ISODate {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    return fromUTC(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
  }
}

export function addDays(iso: ISODate, n: number): ISODate {
  const d = toUTC(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUTC(d);
}

/** Adds calendar months, clamping to the month's last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(iso: ISODate, n: number): ISODate {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return fromUTC(target);
}

/** Whole days from a to b (b − a). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / 86_400_000);
}

/** ISO weekday: Monday = 1 … Sunday = 7. */
export function isoWeekday(iso: ISODate): number {
  const d = toUTC(iso).getUTCDay();
  return d === 0 ? 7 : d;
}

export function startOfWeek(iso: ISODate): ISODate {
  return addDays(iso, 1 - isoWeekday(iso));
}

export function startOfMonth(iso: ISODate): ISODate {
  return `${iso.slice(0, 7)}-01`;
}

export function endOfMonth(iso: ISODate): ISODate {
  return addDays(addMonths(startOfMonth(iso), 1), -1);
}

export function eachDay(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function minDate(a: ISODate, b: ISODate) {
  return a < b ? a : b;
}
export function maxDate(a: ISODate, b: ISODate) {
  return a > b ? a : b;
}

/** 6×7 grid of dates for a month view, weeks starting Monday. */
export function monthGrid(monthAnchor: ISODate): ISODate[] {
  const first = startOfWeek(startOfMonth(monthAnchor));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function weekdayName(iso: ISODate, long = false) {
  return (long ? WEEKDAYS_LONG : WEEKDAYS)[isoWeekday(iso) - 1];
}
export function weekdayLabel(isoDow: number, long = false) {
  return (long ? WEEKDAYS_LONG : WEEKDAYS)[isoDow - 1];
}
export function monthName(iso: ISODate, long = true) {
  const m = Number(iso.slice(5, 7)) - 1;
  return (long ? MONTHS_LONG : MONTHS)[m];
}

export type DateFormat = "d MMM yyyy" | "dd/MM/yyyy" | "MM/dd/yyyy" | "yyyy-MM-dd";

export function formatDate(iso: ISODate | null | undefined, fmt: DateFormat | string = "d MMM yyyy"): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  switch (fmt) {
    case "dd/MM/yyyy":
      return `${d}/${m}/${y}`;
    case "MM/dd/yyyy":
      return `${m}/${d}/${y}`;
    case "yyyy-MM-dd":
      return iso;
    default:
      return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
  }
}

/** "Mon, 26 Oct" */
export function formatShort(iso: ISODate): string {
  return `${weekdayName(iso)}, ${Number(iso.slice(8, 10))} ${monthName(iso, false)}`;
}

/** "Today", "Tomorrow", "Yesterday", "in 5 days", "3 days ago" */
export function relativeDay(iso: ISODate, today: ISODate): string {
  const n = daysBetween(today, iso);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}
