import type { Membership, PackageSummary, Profile } from "../types";
import { addDays, daysBetween, formatDate, formatShort, isoWeekday, relativeDay, type ISODate } from "./dates";
import type { Forecast } from "./forecast";

export interface Reminder {
  id: string;
  kind: keyof Profile["reminders"];
  tone: "loss" | "warn" | "info" | "good";
  title: string;
  detail?: string;
  href?: string;
}

export function membershipEnd(m: Membership) {
  return { date: m.confirmed_end_date ?? m.estimated_end_date, confirmed: !!m.confirmed_end_date };
}

export function membershipStatus(m: Membership, today: ISODate) {
  const { date, confirmed } = membershipEnd(m);
  if (today < m.start_date) return { state: "upcoming" as const, daysLeft: daysBetween(today, date), confirmed };
  const daysLeft = daysBetween(today, date);
  return { state: daysLeft < 0 ? ("expired" as const) : ("active" as const), daysLeft, confirmed };
}

export function buildReminders(args: {
  profile: Profile;
  today: ISODate;
  membership?: Membership;
  pkg?: PackageSummary;
  forecast?: Forecast;
  reviewCount: number;
  todayLogged: boolean;
  todayScheduled: boolean;
  outstandingPaise: number;
  pendingPaymentPaise: number;
  lastWeekWorkouts: number;
}): Reminder[] {
  const r = args.profile.reminders;
  const out: Reminder[] = [];
  const { today, pkg, forecast, membership } = args;

  if (r.attendance_confirmation && args.todayScheduled && !args.todayLogged) {
    out.push({ id: "log-today", kind: "attendance_confirmation", tone: "info", title: "Log today's training", detail: "Did you go to the gym today?" });
  }
  if (r.attendance_confirmation && args.reviewCount > 0) {
    out.push({
      id: "review",
      kind: "attendance_confirmation",
      tone: "warn",
      title: `${args.reviewCount} past ${args.reviewCount === 1 ? "day needs" : "days need"} confirming`,
      detail: "Unconfirmed days never count as attended or missed until you review them.",
      href: "/review",
    });
  }
  if (membership && r.membership_expiry) {
    const st = membershipStatus(membership, today);
    if (!st.confirmed) {
      out.push({
        id: "membership-confirm",
        kind: "membership_expiry",
        tone: "warn",
        title: `Confirm ${membership.gym_name}'s expiry date`,
        detail: `Estimated ${formatDate(membership.estimated_end_date)} — your contract may say otherwise.`,
        href: "/membership/gym",
      });
    }
    if (st.state === "active" && st.daysLeft <= args.profile.membership_warning_days) {
      out.push({
        id: "membership-expiry",
        kind: "membership_expiry",
        tone: st.daysLeft <= 3 ? "loss" : "warn",
        title: `Membership ends ${relativeDay(membershipEnd(membership).date, today).toLowerCase()}`,
        detail: `${membership.gym_name} · ${st.confirmed ? "confirmed" : "estimated"} end ${formatDate(membershipEnd(membership).date)}`,
        href: "/membership/gym",
      });
    } else if (st.state === "expired") {
      out.push({ id: "membership-expired", kind: "membership_expiry", tone: "loss", title: `${membership.gym_name} membership has ended`, href: "/membership/gym" });
    }
  }
  if (pkg && r.upcoming_session && forecast?.nextSession && pkg.remaining > 0) {
    const d = forecast.nextSession;
    if (daysBetween(today, d) <= 1) {
      out.push({
        id: "next-session",
        kind: "upcoming_session",
        tone: "info",
        title: `PT with ${pkg.trainer_name} ${relativeDay(d, today).toLowerCase()}`,
        detail: formatShort(d),
      });
    }
  }
  if (pkg && r.package_exhaustion) {
    const threshold = args.profile.renewal_warning_days;
    if (pkg.remaining <= 0) {
      out.push({ id: "pkg-empty", kind: "package_exhaustion", tone: "loss", title: "PT package used up — renew to keep training", href: "/packages/new?renew=" + pkg.id });
    } else if (forecast?.finalDate && daysBetween(today, forecast.finalDate) <= threshold) {
      out.push({
        id: "pkg-soon",
        kind: "package_exhaustion",
        tone: "warn",
        title: `${pkg.remaining} PT ${pkg.remaining === 1 ? "session" : "sessions"} left`,
        detail: `Estimated to run out around ${formatDate(forecast.finalDate)}. Plan your renewal.`,
        href: "/packages/new?renew=" + pkg.id,
      });
    }
  }
  if (pkg?.expiry_date && r.package_expiry) {
    const days = daysBetween(today, pkg.expiry_date);
    if (days >= 0 && (days <= args.profile.renewal_warning_days || forecast?.runsPastExpiry)) {
      out.push({
        id: "pkg-expiry",
        kind: "package_expiry",
        tone: forecast?.runsPastExpiry ? "loss" : "warn",
        title: `PT package expires ${relativeDay(pkg.expiry_date, today).toLowerCase()}`,
        detail: forecast?.runsPastExpiry ? `About ${forecast.unusedAtExpiry} sessions may go unused at your current schedule.` : undefined,
        href: `/packages/${pkg.id}`,
      });
    }
  }
  if (r.pending_payments && (args.outstandingPaise > 0 || args.pendingPaymentPaise > 0)) {
    out.push({
      id: "payments",
      kind: "pending_payments",
      tone: "info",
      title: "Some PT fees aren't recorded as paid",
      detail: "Record payments in Membership so your spending totals are accurate.",
      href: pkg ? `/packages/${pkg.id}` : "/membership/training",
    });
  }
  if (r.weekly_review && [1, 7].includes(isoWeekday(today))) {
    out.push({
      id: "weekly",
      kind: "weekly_review",
      tone: "good",
      title: "Weekly review",
      detail: `${args.lastWeekWorkouts} ${args.lastWeekWorkouts === 1 ? "workout" : "workouts"} logged last week. Week of ${formatDate(addDays(today, -7))}.`,
      href: "/progress",
    });
  }
  return out;
}
