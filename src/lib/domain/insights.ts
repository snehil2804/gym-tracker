import type { Attendance, PackageSummary } from "../types";
import { addDays, formatDate, startOfMonth, type ISODate } from "./dates";
import type { FinanceSummary } from "./finance";
import type { Forecast } from "./forecast";
import { gymAttendance } from "./stats";

export interface Insight {
  id: string;
  tone: "good" | "warn" | "loss" | "info";
  text: string;
  href?: string;
}

const MIN_CONFIRMED_DAYS = 8;

/** Insights are produced only when the underlying records support them. */
export function buildInsights(args: {
  today: ISODate;
  finance: FinanceSummary;
  attendance: Attendance[];
  activePackage?: PackageSummary;
  forecast?: Forecast;
  reviewCount: number;
}): Insight[] {
  const { today, finance, attendance, activePackage, forecast, reviewCount } = args;
  const out: Insight[] = [];

  if (reviewCount > 0) {
    out.push({
      id: "review",
      tone: "warn",
      text: `${reviewCount} past training ${reviewCount === 1 ? "day needs" : "days need"} confirming before your balance and losses are final.`,
      href: "/review",
    });
  }

  if (finance.missedSessionsThisMonth > 0) {
    out.push({
      id: "missed-month",
      tone: "loss",
      text: `You missed ${finance.missedSessionsThisMonth} chargeable PT ${finance.missedSessionsThisMonth === 1 ? "session" : "sessions"} this month.`,
      href: "/membership/spending",
    });
  }

  // Month-over-month attendance (both months need enough confirmed days).
  const thisMonth = startOfMonth(today);
  const lastMonthEnd = addDays(thisMonth, -1);
  const lastMonth = startOfMonth(lastMonthEnd);
  const prevMonthEnd = addDays(lastMonth, -1);
  const prevMonth = startOfMonth(prevMonthEnd);
  const a = gymAttendance(attendance, lastMonth, lastMonthEnd);
  const b = gymAttendance(attendance, prevMonth, prevMonthEnd);
  if (
    a.rate !== null && b.rate !== null &&
    a.attended + a.missed >= MIN_CONFIRMED_DAYS && b.attended + b.missed >= MIN_CONFIRMED_DAYS
  ) {
    const diff = Math.round((a.rate - b.rate) * 100);
    if (Math.abs(diff) >= 5) {
      out.push({
        id: "attendance-trend",
        tone: diff > 0 ? "good" : "warn",
        text: `Gym attendance ${diff > 0 ? "improved" : "dropped"} by ${Math.abs(diff)} percentage points last month (${Math.round(b.rate * 100)}% → ${Math.round(a.rate * 100)}%).`,
      });
    }
  }

  if (activePackage && forecast?.finalDate && activePackage.remaining > 0) {
    out.push({
      id: "package-estimate",
      tone: "info",
      text: `At your current schedule, ${activePackage.trainer_name}'s package is estimated to run out around ${formatDate(forecast.finalDate)}.`,
      href: `/packages/${activePackage.id}`,
    });
  }
  if (activePackage && forecast?.runsPastExpiry && forecast.unusedAtExpiry) {
    out.push({
      id: "expiry-conflict",
      tone: "warn",
      text: `${forecast.unusedAtExpiry} sessions would still be unused when the package expires on ${formatDate(activePackage.expiry_date)}.`,
      href: `/packages/${activePackage.id}`,
    });
  }

  if (finance.missedSessions > 0 && finance.remainingSessions > 0) {
    out.push({
      id: "use-it",
      tone: "info",
      text: `${finance.remainingSessions} prepaid ${finance.remainingSessions === 1 ? "session is" : "sessions are"} left — attend them all to get full value.`,
    });
  }
  return out;
}
