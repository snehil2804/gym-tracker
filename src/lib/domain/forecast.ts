import type { ScheduleBlock } from "../types";
import { blocksOn } from "./attendance";
import { addDays, daysBetween, isoWeekday, maxDate, type ISODate } from "./dates";

const HORIZON_DAYS = 3 * 366;

export interface ForecastInput {
  /** First date that could still hold a session (today if today's session is not yet logged). */
  from: ISODate;
  remaining: number;
  scheduleDays: number[];
  blocks: ScheduleBlock[];
  packageId?: string;
  packageStart?: ISODate;
  expiry?: ISODate | null;
}

export interface Forecast {
  /** Estimated date of the last remaining session, assuming every planned session happens. */
  finalDate: ISODate | null;
  nextSession: ISODate | null;
  /** Planned session days left before the expiry date (inclusive), if the package expires. */
  opportunitiesBeforeExpiry: number | null;
  /** Sessions that would still be unused on the expiry date at the planned schedule. */
  unusedAtExpiry: number | null;
  runsPastExpiry: boolean;
  horizonExceeded: boolean;
}

export function isPlannedSessionDay(date: ISODate, scheduleDays: number[], blocks: ScheduleBlock[], packageId?: string) {
  return scheduleDays.includes(isoWeekday(date)) && blocksOn(date, blocks, packageId).length === 0;
}

/** Next `count` planned session dates on or after `from`. */
export function upcomingSessionDates(
  from: ISODate,
  count: number,
  scheduleDays: number[],
  blocks: ScheduleBlock[],
  packageId?: string,
): ISODate[] {
  const out: ISODate[] = [];
  if (scheduleDays.length === 0 || count <= 0) return out;
  for (let i = 0, d = from; i < HORIZON_DAYS && out.length < count; i++, d = addDays(d, 1)) {
    if (isPlannedSessionDay(d, scheduleDays, blocks, packageId)) out.push(d);
  }
  return out;
}

export function forecastPackage(input: ForecastInput): Forecast {
  const start = input.packageStart ? maxDate(input.from, input.packageStart) : input.from;
  const empty: Forecast = {
    finalDate: null,
    nextSession: null,
    opportunitiesBeforeExpiry: null,
    unusedAtExpiry: null,
    runsPastExpiry: false,
    horizonExceeded: false,
  };
  if (input.scheduleDays.length === 0) return empty;

  const next = upcomingSessionDates(start, 1, input.scheduleDays, input.blocks, input.packageId)[0] ?? null;
  if (input.remaining <= 0) return { ...empty, nextSession: next };

  const dates = upcomingSessionDates(start, input.remaining, input.scheduleDays, input.blocks, input.packageId);
  const horizonExceeded = dates.length < input.remaining;
  const finalDate = horizonExceeded ? null : dates[dates.length - 1];

  let opportunitiesBeforeExpiry: number | null = null;
  let unusedAtExpiry: number | null = null;
  let runsPastExpiry = false;
  if (input.expiry) {
    if (input.expiry < start) {
      opportunitiesBeforeExpiry = 0;
    } else {
      const span = daysBetween(start, input.expiry) + 1;
      opportunitiesBeforeExpiry = upcomingSessionDates(start, span, input.scheduleDays, input.blocks, input.packageId).filter(
        (d) => d <= input.expiry!,
      ).length;
    }
    unusedAtExpiry = Math.max(0, input.remaining - opportunitiesBeforeExpiry);
    runsPastExpiry = unusedAtExpiry > 0;
  }

  return { finalDate, nextSession: next, opportunitiesBeforeExpiry, unusedAtExpiry, runsPastExpiry, horizonExceeded };
}
