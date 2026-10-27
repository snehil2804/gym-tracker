"use client";

import { ChevronDown, ChevronRight, Info } from "lucide-react";
import Link from "next/link";
import { Bars, ChartCard } from "@/components/charts";
import { Badge, Card, CardHeader, ErrorNote, KeyValue, PageHeader, Skeleton, Stat, cx } from "@/components/ui";
import { useCore, type Core } from "@/lib/data/derived";
import { formatDate, monthName } from "@/lib/domain/dates";
import { missedByMonth } from "@/lib/domain/finance";
import { sessionValue } from "@/lib/domain/money";
import { EyeToggle, useMoneyFormatter } from "@/components/preferences";
import { packageState } from "@/lib/domain/packages";
import { gymAttendance, ptAttendance } from "@/lib/domain/stats";

export default function FinancePage() {
  const { data: d, loading, error } = useCore();
  if (error) return <ErrorNote error={error} />;
  if (loading || !d) return <Skeleton className="h-96" />;
  return <Finance d={d} />;
}

const DEFINITIONS: [string, string][] = [
  ["Cost per session", "Package price ÷ sessions purchased, fixed per package. Older packages always keep their own rate."],
  ["Missed PT value", "Confirmed chargeable PT absences × that package's rate. It is the value of prepaid sessions you didn't use — not new money spent that day."],
  ["Possible misses to confirm", "Scheduled PT days where you missed the gym but haven't confirmed whether the session was charged. Shown as an upper bound; never added to any loss."],
  ["Trainer-cancelled sessions", "Not a loss. They stay in your balance unless you record otherwise."],
  ["Rescheduled sessions", "Only the make-up session uses a session, so a reschedule is never counted twice."],
  ["Spent", "Only payments marked paid (gym membership marked paid + PT payments − refunds). Pending or unconfirmed amounts are listed separately."],
  ["Not yet paid", "Package price minus payments recorded as paid, per package."],
  ["Prepaid value left", "Remaining sessions × rate, for packages that can still be used."],
  ["Effective cost per completed session", "PT money actually paid (minus refunds) ÷ PT sessions completed."],
  ["Credits", "Sessions the trainer added for free. They raise the balance; they are valued at the package rate for reference but are not cash."],
  ["Refunded sessions", "Sessions removed from the balance because money was returned. The money is recorded as a refund payment."],
];

function Finance({ d }: { d: Core }) {
  const f = d.finance;
  const months = missedByMonth(d.ledger, d.packages);
  const att = gymAttendance(d.attendance, d.trackingStart ?? "2000-01-01", d.today);
  const pt = ptAttendance(d.attendance, d.trackingStart ?? "2000-01-01", d.today);
  const totalWorkouts = d.workouts.length;
  const fMissed = useMoneyFormatter("fin-missed");
  const fSpent = useMoneyFormatter("fin-spent");
  const fValue = useMoneyFormatter("fin-value");
  const fChart = useMoneyFormatter("fin-chart");
  const fPkg = useMoneyFormatter("fin-packages");
  const fPay = useMoneyFormatter("fin-payments");

  return (
    <div className="anim-rise space-y-4">
      <PageHeader title="Money" subtitle="Cash you actually paid is kept separate from the value of the prepaid sessions it bought." />

      <div className="grid gap-4 lg:grid-cols-3">
        {d.ptEnabled && (
        <Card glow="accent" tone={f.missedValueThisMonth > 0 ? "accent" : undefined} className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">Missed PT value · {monthName(d.today)}</p>
            <EyeToggle id="fin-missed" />
          </div>
          <p className={cx("num mt-2 font-display text-[48px] leading-none font-semibold tracking-tight", f.missedValueThisMonth > 0 && "text-accent")}>
            {fMissed(f.missedValueThisMonth)}
          </p>
          <p className="mt-2 text-[15px] text-ink-2">
            {f.missedSessionsThisMonth > 0
              ? `worth of PT sessions missed this month — ${f.missedSessionsThisMonth} confirmed chargeable ${f.missedSessionsThisMonth === 1 ? "absence" : "absences"}.`
              : "No confirmed chargeable PT sessions missed this month."}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-3">
            <Stat label="All-time missed value" value={fMissed(f.missedValue)} hint={`${f.missedSessions} ${f.missedSessions === 1 ? "session" : "sessions"}`} tone={f.missedValue ? "accent" : undefined} />
            <Stat label="Forfeited at closure" value={fMissed(f.expiredValue)} hint="unused when a package closed" />
            <Stat
              label="Possible misses to confirm"
              value={f.pendingReviewDays ? `≤ ${fMissed(f.pendingReviewValue)}` : "—"}
              hint={f.pendingReviewDays ? <Link href="/review" className="text-warn underline-offset-2 hover:underline">{f.pendingReviewDays} days → review</Link> : "nothing pending"}
            />
          </div>
        </Card>
        )}
        <Card glow="violet" className={cx("p-5", !d.ptEnabled && "lg:col-span-3")}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">Spent (paid)</p>
            <EyeToggle id="fin-spent" />
          </div>
          <p className="num mt-2 font-display text-[40px] leading-none font-semibold">{fSpent(f.totalSpent)}</p>
          <KeyValue
            className="mt-3"
            items={[
              { k: "Gym membership", v: fSpent(f.gymPaid) },
              ...(d.ptEnabled ? [{ k: "PT payments", v: fSpent(f.ptPaid) }] : []),
              ...(d.ptEnabled ? [{ k: "PT refunds received", v: f.ptRefunded ? `−${fSpent(f.ptRefunded)}` : fSpent(0) }] : []),
              ...(d.ptEnabled ? [{ k: "PT not yet paid", v: <span className={f.ptOutstanding ? "text-warn" : ""}>{fSpent(f.ptOutstanding)}</span> }] : []),
              { k: "Gym not confirmed paid", v: <span className={f.gymUnconfirmed ? "text-warn" : ""}>{fSpent(f.gymUnconfirmed)}</span> },
            ]}
          />
        </Card>
      </div>

      {d.ptEnabled && (
      <>
      <Card glow="good" className="p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold">Where the prepaid PT value went</h2>
          <EyeToggle id="fin-value" />
        </div>
        <p className="text-xs text-muted">Allocated value of sessions at each package&apos;s own rate. Not cash flows.</p>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Completed" value={fValue(f.completedValue)} hint={`${f.completedSessions} ${f.completedSessions === 1 ? "session" : "sessions"}`} tone="good" />
          <Stat label="Missed (charged)" value={fValue(f.missedValue)} hint={`${f.missedSessions} ${f.missedSessions === 1 ? "session" : "sessions"}`} tone={f.missedValue ? "accent" : undefined} />
          <Stat label="Remaining" value={fValue(f.remainingValue)} hint={`${f.remainingSessions} ${f.remainingSessions === 1 ? "session" : "sessions"}`} />
          <Stat label="Trainer cancelled" value={fValue(f.cancelledValue)} hint={`${f.cancelledSessions} · kept in balance`} />
          <Stat label="Refunded" value={fValue(f.refundedValue)} />
          <Stat label="Credited" value={fValue(f.creditedValue)} hint="free sessions" />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-4">
          <Stat label="Effective cost per completed PT session" value={f.effectiveCostPerCompleted === null ? "—" : fValue(f.effectiveCostPerCompleted)} hint={f.effectiveCostPerCompleted === null ? "needs a paid package and a completed session" : "paid ÷ completed"} />
          <Stat label="Cost per logged workout" value={totalWorkouts && f.totalSpent ? fValue(Math.round(f.totalSpent / totalWorkouts)) : "—"} hint={totalWorkouts ? `${totalWorkouts} workouts` : "no workouts logged"} />
          <Stat label="Gym attendance" value={att.rate === null ? "—" : `${Math.round(att.rate * 100)}%`} hint={`${att.attended}/${att.attended + att.missed} confirmed days`} />
          <Stat label="PT attendance" value={pt.rate === null ? "—" : `${Math.round(pt.rate * 100)}%`} hint={`${pt.completed}/${pt.completed + pt.charged} confirmed sessions`} />
        </div>
        {f.missedSessions > 0 && (
          <p className="mt-4 rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-ink-2">
            <strong>Potential savings:</strong> had the {f.missedSessions} confirmed chargeable {f.missedSessions === 1 ? "absence" : "absences"} been attended, you would have used{" "}
            {fValue(f.missedValue)} more of what you prepaid. Assumes each missed session was available to attend at its package rate.
          </p>
        )}
      </Card>

      {months.length > 0 && (
        <ChartCard
          title={
            <span className="flex items-center gap-2">
              Missed PT value by month <EyeToggle id="fin-chart" className="size-7" />
            </span>
          }
          subtitle="Confirmed chargeable absences only"
          table={{ columns: ["Month", "Sessions", "Value"], rows: months.map((m) => [`${monthName(`${m.month}-01`)} ${m.month.slice(0, 4)}`, m.sessions, fChart(m.value)]) }}
        >
          <Bars
            data={months.map((m) => ({ ...m, rupees: m.value / 100 }))}
            x="month"
            xFormat={(m) => `${monthName(`${m}-01`, false)} ${m.slice(2, 4)}`}
            format={(v) => fChart(Math.round(v * 100))}
            allowDecimals
            bars={[{ key: "rupees", name: "Missed value", color: "var(--chart-loss)" }]}
          />
        </ChartCard>
      )}

      <Card>
        <CardHeader title="By package" action={<EyeToggle id="fin-packages" />} />
        <div className="overflow-x-auto px-5 pb-4">
          <table className="mt-2 w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                {["Package", "Status", "Price", "Rate", "Paid", "Not paid", "Completed", "Missed", "Remaining"].map((h) => (
                  <th key={h} className="py-2 pr-3 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="num divide-y divide-line">
              {d.packages.map((p) => {
                const st = packageState(p, d.today);
                const v = (n: number) => fPkg(sessionValue(n, p.price_paise, p.sessions_purchased));
                return (
                  <tr key={p.id}>
                    <td className="py-2.5 pr-3">
                      <Link href={`/packages/${p.id}`} className="font-medium hover:underline">
                        {p.trainer_name} · {formatDate(p.start_date)}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-3">
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </td>
                    <td className="py-2.5 pr-3">{fPkg(p.price_paise)}</td>
                    <td className="py-2.5 pr-3">{v(1)}</td>
                    <td className="py-2.5 pr-3">{fPkg(p.paid_paise)}</td>
                    <td className={cx("py-2.5 pr-3", p.outstanding_paise && "text-warn")}>{fPkg(p.outstanding_paise)}</td>
                    <td className="py-2.5 pr-3">
                      {p.completed} · {v(p.completed)}
                    </td>
                    <td className={cx("py-2.5 pr-3", p.forfeited && "text-accent")}>
                      {p.forfeited} · {v(p.forfeited)}
                    </td>
                    <td className="py-2.5 pr-3">
                      {p.remaining} · {v(Math.max(p.remaining, 0))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      </>
      )}

      <Card>
        <CardHeader title="Payments" action={<EyeToggle id="fin-payments" />} />
        {d.payments.length === 0 && d.memberships.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">No payments recorded.</p>
        ) : (
          <ul className="divide-y divide-line px-5 pb-2">
            {d.memberships.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block font-medium">{m.gym_name} membership</span>
                  <span className="text-xs text-muted">
                    {formatDate(m.start_date)} · {m.duration_months} months{m.paid_on ? ` · paid ${formatDate(m.paid_on)}` : ""}
                  </span>
                </span>
                <span className="num flex items-center gap-2 font-semibold">
                  {m.price_is_approximate ? "≈ " : ""}
                  {fPay(m.price_paise)}
                  <Badge tone={m.payment_status === "paid" ? "good" : "warn"}>{m.payment_status}</Badge>
                </span>
              </li>
            ))}
            {(d.ptEnabled ? d.payments : []).map((p) => {
              const pkg = d.packages.find((x) => x.id === p.package_id);
              return (
                <li key={p.id}>
                  <Link href={`/packages/${p.package_id}`} className="flex items-center justify-between gap-3 py-3 text-sm hover:opacity-80">
                    <span className="min-w-0">
                      <span className="block font-medium">
                        {p.kind === "refund" ? "Refund from " : "PT · "}
                        {pkg?.trainer_name}
                      </span>
                      <span className="text-xs text-muted">
                        {p.status === "paid" ? formatDate(p.paid_on) : p.due_on ? `due ${formatDate(p.due_on)}` : "pending"}
                        {p.method ? ` · ${p.method}` : ""}
                      </span>
                    </span>
                    <span className="num flex items-center gap-2 font-semibold">
                      {p.kind === "refund" ? "−" : ""}
                      {fPay(p.amount_paise)}
                      <Badge tone={p.status === "paid" ? "good" : "warn"}>{p.kind === "refund" ? "refund" : p.status}</Badge>
                      <ChevronRight className="size-4 text-faint" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <details className="group rounded-2xl border border-line bg-surface p-5 shadow-card">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold">
          <Info className="size-4 text-muted" /> How every number is calculated
          <ChevronDown className="ml-auto size-4 text-muted transition-transform group-open:rotate-180" />
        </summary>
        <dl className="mt-4 space-y-3 text-sm">
          {DEFINITIONS.map(([k, v]) => (
            <div key={k}>
              <dt className="font-medium text-ink">{k}</dt>
              <dd className="text-muted">{v}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
