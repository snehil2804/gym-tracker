import type { Attendance, LedgerEntry, Membership, PackageSummary, Payment } from "../types";
import { isScheduledDay } from "./attendance";
import { endOfMonth, startOfMonth, type ISODate } from "./dates";
import { sessionValue } from "./money";

/**
 * Definitions (all amounts in paise):
 *
 *  Cash
 *   gymPaid            Σ membership price where payment_status = 'paid'
 *   gymUnconfirmed     Σ membership price not yet confirmed as paid (pending or unconfirmed)
 *   ptPaid             Σ PT payments with status 'paid' (refunds excluded)
 *   ptRefunded         Σ PT refunds received
 *   ptOutstanding      Σ over packages of max(price − paid, 0)   (never counted as spent)
 *   ptPendingScheduled Σ PT payment rows marked 'pending'
 *   totalSpent         gymPaid + ptPaid − ptRefunded
 *
 *  Allocated value of prepaid sessions (not cash flows)
 *   rate               package price / sessions purchased (per package, never the latest rate)
 *   completedValue     completed sessions × rate
 *   missedValue        confirmed chargeable absences (ledger 'forfeited') × rate
 *   expiredValue       unused sessions explicitly forfeited at closure × rate
 *   remainingValue     remaining sessions × rate, for packages that can still be used
 *   cancelledValue     trainer-cancelled sessions × rate (kept in balance, shown for information)
 *   refundedValue      sessions removed by refund × rate
 *   creditedValue      sessions credited by the trainer × rate
 *   pendingReviewValue scheduled PT days whose outcome is still unconfirmed × rate (upper bound,
 *                      never added to any loss total)
 */
export interface FinanceSummary {
  gymPaid: number;
  gymUnconfirmed: number;
  ptPaid: number;
  ptRefunded: number;
  ptOutstanding: number;
  ptPendingScheduled: number;
  totalSpent: number;
  completedSessions: number;
  completedValue: number;
  missedSessions: number;
  missedValue: number;
  missedSessionsThisMonth: number;
  missedValueThisMonth: number;
  expiredValue: number;
  remainingSessions: number;
  remainingValue: number;
  cancelledSessions: number;
  cancelledValue: number;
  refundedValue: number;
  creditedValue: number;
  pendingReviewDays: number;
  pendingReviewValue: number;
  effectiveCostPerCompleted: number | null;
}

export function packageUsable(p: Pick<PackageSummary, "status" | "unused_sessions_treatment">) {
  return p.status === "active" || (p.status === "closed" && p.unused_sessions_treatment === "still_usable");
}

/** Value of non-voided ledger entries of the given kind, grouped per package so each uses its own rate. */
export function ledgerValue(
  entries: LedgerEntry[],
  packages: Map<string, PackageSummary>,
  filter: (e: LedgerEntry) => boolean,
): { sessions: number; value: number } {
  const perPackage = new Map<string, number>();
  for (const e of entries) {
    if (e.voided_at || !filter(e)) continue;
    perPackage.set(e.package_id, (perPackage.get(e.package_id) ?? 0) + Math.abs(e.sessions));
  }
  let sessions = 0;
  let value = 0;
  for (const [pkgId, n] of perPackage) {
    const p = packages.get(pkgId);
    sessions += n;
    if (p) value += sessionValue(n, p.price_paise, p.sessions_purchased);
  }
  return { sessions, value };
}

export function computeFinance(args: {
  packages: PackageSummary[];
  ledger: LedgerEntry[];
  payments: Payment[];
  memberships: Membership[];
  attendance: Attendance[];
  today: ISODate;
  trackingStart?: ISODate | null;
}): FinanceSummary {
  const { packages, ledger, payments, memberships, attendance, today } = args;
  const byId = new Map(packages.map((p) => [p.id, p]));
  const live = packages.filter((p) => p.status !== "cancelled");

  const gymPaid = memberships.filter((m) => m.payment_status === "paid").reduce((s, m) => s + m.price_paise, 0);
  const gymUnconfirmed = memberships.filter((m) => m.payment_status !== "paid").reduce((s, m) => s + m.price_paise, 0);

  const ptPaid = payments.filter((p) => p.kind === "payment" && p.status === "paid").reduce((s, p) => s + p.amount_paise, 0);
  const ptRefunded = payments.filter((p) => p.kind === "refund" && p.status === "paid").reduce((s, p) => s + p.amount_paise, 0);
  const ptPendingScheduled = payments.filter((p) => p.kind === "payment" && p.status === "pending").reduce((s, p) => s + p.amount_paise, 0);
  const ptOutstanding = live.reduce((s, p) => s + Math.max(p.price_paise - p.paid_paise, 0), 0);

  const completed = ledgerValue(ledger, byId, (e) => e.kind === "completed");
  const missed = ledgerValue(ledger, byId, (e) => e.kind === "forfeited");
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const missedMonth = ledgerValue(
    ledger,
    byId,
    (e) => e.kind === "forfeited" && !!e.session_date && e.session_date >= monthStart && e.session_date <= monthEnd,
  );
  const expired = ledgerValue(ledger, byId, (e) => e.kind === "expired");
  const refunded = ledgerValue(ledger, byId, (e) => e.kind === "refund");
  const credited = ledgerValue(ledger, byId, (e) => e.kind === "credit");

  let remainingSessions = 0;
  let remainingValue = 0;
  let cancelledSessions = 0;
  let cancelledValue = 0;
  for (const p of live) {
    if (packageUsable(p) && p.remaining > 0) {
      remainingSessions += p.remaining;
      remainingValue += sessionValue(p.remaining, p.price_paise, p.sessions_purchased);
    }
    cancelledSessions += p.trainer_cancelled;
    cancelledValue += sessionValue(p.trainer_cancelled, p.price_paise, p.sessions_purchased);
  }

  // Days that may have been chargeable but are not confirmed: valued at the rate of the
  // package active on that date (upper bound only, never part of a loss total).
  let pendingReviewDays = 0;
  let pendingReviewValue = 0;
  for (const a of attendance) {
    if (a.date > today) continue;
    const pkg = a.pt_package_id ? byId.get(a.pt_package_id) : activePackageOn(live, a.date);
    if (!pkg) continue;
    const scheduled = isScheduledDay(a.date, pkg.schedule_days);
    const open =
      a.pt_status === "missed_unconfirmed" ||
      (a.pt_status === "unverified" && a.gym_status === "absent" && scheduled);
    if (open) {
      pendingReviewDays += 1;
      pendingReviewValue += sessionValue(1, pkg.price_paise, pkg.sessions_purchased);
    }
  }

  const totalSpent = gymPaid + ptPaid - ptRefunded;
  return {
    gymPaid,
    gymUnconfirmed,
    ptPaid,
    ptRefunded,
    ptOutstanding,
    ptPendingScheduled,
    totalSpent,
    completedSessions: completed.sessions,
    completedValue: completed.value,
    missedSessions: missed.sessions,
    missedValue: missed.value,
    missedSessionsThisMonth: missedMonth.sessions,
    missedValueThisMonth: missedMonth.value,
    expiredValue: expired.value,
    remainingSessions,
    remainingValue,
    cancelledSessions,
    cancelledValue,
    refundedValue: refunded.value,
    creditedValue: credited.value,
    pendingReviewDays,
    pendingReviewValue,
    effectiveCostPerCompleted: completed.sessions > 0 ? Math.round((ptPaid - ptRefunded) / completed.sessions) : null,
  };
}

/** Package a session on `date` would belong to (mirrors private.resolve_package, without the balance check). */
export function activePackageOn(packages: PackageSummary[], date: ISODate): PackageSummary | undefined {
  return packages
    .filter(
      (p) =>
        p.status === "active" &&
        p.start_date <= date &&
        (!p.expiry_date || date <= p.expiry_date || p.extension_allowed),
    )
    .sort((a, b) => (a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0))[0];
}

/** Value of each missed session per month, for charts. */
export function missedByMonth(ledger: LedgerEntry[], packages: PackageSummary[]) {
  const byId = new Map(packages.map((p) => [p.id, p]));
  const months = new Map<string, LedgerEntry[]>();
  for (const e of ledger) {
    if (e.voided_at || e.kind !== "forfeited" || !e.session_date) continue;
    const m = e.session_date.slice(0, 7);
    months.set(m, [...(months.get(m) ?? []), e]);
  }
  return [...months.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, entries]) => ({ month, ...ledgerValue(entries, byId, () => true) }));
}
