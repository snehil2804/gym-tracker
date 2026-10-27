"use client";

import { ArrowRight, CalendarClock, ChevronDown, ChevronRight, Dumbbell, IdCard, Info, Package, Plus, RefreshCw, Settings2, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { Bars, ChartCard } from "@/components/charts";
import { EyeToggle, useMoneyFormatter, useMoneyHidden } from "@/components/preferences";
import { Badge, Card, EmptyState, ErrorNote, Estimate, KeyValue, LinkButton, PageHeader, ProgressBar, Skeleton, Stat, cx } from "@/components/ui";
import { useCore, type Core } from "@/lib/data/derived";
import { daysBetween, formatDate, monthName } from "@/lib/domain/dates";
import { missedByMonth, spendByMonth } from "@/lib/domain/finance";
import { sessionValue } from "@/lib/domain/money";
import { packageState } from "@/lib/domain/packages";
import { membershipEnd, membershipStatus } from "@/lib/domain/reminders";
import { gymAttendance, ptAttendance } from "@/lib/domain/stats";

/**
 * One page for everything you pay for: personal training packages, the gym membership, and an
 * analytics card for the money behind both. Replaces the old "PT Packages" and "Money" pages
 * (their URLs redirect here).
 */
export default function MembershipPage() {
  const { data: d, loading, error } = useCore();
  useEffect(() => {
    if (!d || !window.location.hash) return;
    // Sections render after the data loads, so jump to the linked one (e.g. #spending) afterwards.
    const id = window.location.hash;
    // Instant jump: a smooth scroll can be cancelled while the page is still settling after load.
    const go = () => document.querySelector(id)?.scrollIntoView({ block: "start" });
    const timers = [setTimeout(go, 250), setTimeout(() => window.scrollY < 40 && go(), 900)];
    return () => timers.forEach(clearTimeout);
  }, [d]);
  if (error) return <ErrorNote error={error} />;
  if (loading || !d) return <Skeleton className="h-96" />;
  return (
    <div className="anim-rise space-y-8">
      <PageHeader title="Membership" subtitle="Your personal training, your gym membership and what they cost you — in one place." />
      <nav aria-label="Sections" className="no-scrollbar -mt-4 flex gap-2 overflow-x-auto px-1">
        {[
          { href: "#personal-training", label: "Personal training", icon: Dumbbell, tone: "text-pink" },
          { href: "#gym", label: "Gym membership", icon: IdCard, tone: "text-teal" },
          { href: "#spending", label: "Spending", icon: Wallet, tone: "text-good" },
        ].map((s) => (
          <a
            key={s.href}
            href={s.href}
            className="flex h-9 shrink-0 items-center gap-2 rounded-full border border-line bg-surface/80 px-3.5 text-sm font-medium text-ink-2 shadow-card backdrop-blur hover:bg-surface"
          >
            <s.icon className={cx("size-4", s.tone)} />
            {s.label}
          </a>
        ))}
      </nav>
      <PersonalTraining d={d} />
      <GymMembership d={d} />
      <Spending d={d} />
    </div>
  );
}

function SectionHead({ id, icon, tone, title, subtitle, actions }: { id: string; icon: ReactNode; tone: string; title: string; subtitle: string; actions?: ReactNode }) {
  return (
    <div id={id} className="mb-3 flex scroll-mt-20 flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className={cx("grid size-10 shrink-0 place-items-center rounded-xl", tone)}>{icon}</span>
        <div className="min-w-0">
          <h2 className="font-display text-xl font-semibold tracking-tight">{title}</h2>
          <p className="text-sm text-muted">{subtitle}</p>
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

function FeatureOff({ what, children }: { what: string; children: ReactNode }) {
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
      <p className="text-sm text-muted">{children}</p>
      <LinkButton href="/settings#training" size="sm" icon={<Settings2 className="size-4" />}>
        Turn on {what}
      </LinkButton>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Personal training
// ---------------------------------------------------------------------------
function PersonalTraining({ d }: { d: Core }) {
  const fmt = useMoneyFormatter("mem-pt");
  const current = d.current;
  return (
    <section>
      <SectionHead
        id="personal-training"
        icon={<Dumbbell className="size-5" />}
        tone="bg-pink-soft text-pink"
        title="Personal training"
        subtitle="Each package keeps its own price, rate and history."
        actions={
          d.ptEnabled ? (
            <>
              <EyeToggle id="mem-pt" />
              {current && (
                <LinkButton href={`/packages/new?renew=${current.id}`} variant="primary" size="sm" icon={<RefreshCw className="size-4" />}>
                  Renew
                </LinkButton>
              )}
              <LinkButton href="/packages/new" size="sm" icon={<Plus className="size-4" />}>
                New package
              </LinkButton>
            </>
          ) : undefined
        }
      />
      {!d.ptEnabled ? (
        <FeatureOff what="personal training">Personal training is switched off, so packages and PT sessions are hidden.</FeatureOff>
      ) : d.packages.length === 0 ? (
        <Card glow="pink">
          <EmptyState icon={<Package className="size-5" />} title="No packages yet" action={<LinkButton href="/packages/new" variant="primary">Add your first package</LinkButton>}>
            Add the PT package you paid for to start tracking sessions and value.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {d.packages.map((p) => {
            const st = packageState(p, d.today);
            const total = p.sessions_purchased + p.credited + p.transferred_in + p.adjusted;
            return (
              <Link key={p.id} href={`/packages/${p.id}`} className="group">
                <Card glow="pink" className="h-full p-5 transition-[border-color,transform] group-hover:-translate-y-0.5 group-hover:border-line-strong">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-muted">
                        {formatDate(p.start_date)}
                        {p.closed_on ? ` – ${formatDate(p.closed_on)}` : p.expiry_date ? ` – expires ${formatDate(p.expiry_date)}` : ""}
                      </p>
                      <h3 className="mt-0.5 truncate text-[17px] font-semibold">
                        {p.trainer_name}
                        {p.label && <span className="font-normal text-muted"> · {p.label}</span>}
                      </h3>
                    </div>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </div>
                  <p className="num mt-4 font-display text-3xl font-semibold">
                    {p.remaining}
                    <span className="ml-1.5 text-sm font-medium text-muted">/ {total} sessions left</span>
                  </p>
                  <ProgressBar
                    className="mt-3"
                    total={total}
                    segments={[
                      { value: p.completed, className: "bg-good", label: "Completed" },
                      { value: p.forfeited + p.expired, className: "bg-accent", label: "Missed" },
                      { value: p.refunded + p.transferred_out, className: "bg-info", label: "Refunded / moved" },
                    ]}
                  />
                  <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-muted">Price</dt>
                      <dd className="num font-semibold">{fmt(p.price_paise)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Per session</dt>
                      <dd className="num font-semibold">{fmt(sessionValue(1, p.price_paise, p.sessions_purchased))}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Paid</dt>
                      <dd className={cx("num font-semibold", p.outstanding_paise > 0 && "text-warn")}>{fmt(p.paid_paise)}</dd>
                    </div>
                  </dl>
                  <p className="mt-4 flex items-center gap-1 text-sm font-medium text-muted group-hover:text-ink">
                    {p.completed} completed · {p.forfeited} missed · {p.trainer_cancelled} cancelled <ArrowRight className="ml-auto size-4" />
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Gym membership
// ---------------------------------------------------------------------------
function GymMembership({ d }: { d: Core }) {
  const fmt = useMoneyFormatter("mem-gym");
  const m = d.membership;
  const others = d.memberships.filter((x) => x.id !== m?.id);
  const gymPaid = d.finance.gymPaid;
  return (
    <section>
      <SectionHead
        id="gym"
        icon={<IdCard className="size-5" />}
        tone="bg-teal-soft text-teal"
        title="Gym membership"
        subtitle="The estimated end date is calculated; the confirmed one is what your contract says."
        actions={
          d.membershipEnabled ? (
            <>
              <EyeToggle id="mem-gym" />
              <LinkButton href="/settings#membership" size="sm" icon={<Plus className="size-4" />}>
                Add / renew
              </LinkButton>
            </>
          ) : undefined
        }
      />
      {!d.membershipEnabled ? (
        <FeatureOff what="gym membership">Gym membership tracking is switched off.</FeatureOff>
      ) : !m ? (
        <Card glow="teal">
          <EmptyState icon={<CalendarClock className="size-5" />} title="No gym membership" action={<LinkButton href="/settings#membership" variant="primary">Add membership</LinkButton>}>
            Add your membership to track its expiry and what it cost.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-5">
          <CurrentMembership d={d} fmt={fmt} />
          <Card glow="teal" className="p-5 lg:col-span-2">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-teal uppercase">Spent on the gym</p>
            <p className="num mt-2 font-display text-[34px] leading-none font-semibold">{fmt(gymPaid)}</p>
            <p className="mt-1 text-xs text-muted">
              {d.memberships.length} {d.memberships.length === 1 ? "membership" : "memberships"} · only payments marked paid count
            </p>
            {d.finance.gymUnconfirmed > 0 && (
              <p className="mt-3 rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">{fmt(d.finance.gymUnconfirmed)} not confirmed as paid yet.</p>
            )}
            {others.length > 0 && (
              <ul className="mt-4 divide-y divide-line border-t border-line text-sm">
                {others.map((x) => {
                  const end = membershipEnd(x);
                  return (
                    <li key={x.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{x.gym_name}</span>
                        <span className="text-xs text-muted">
                          {formatDate(x.start_date)} – {formatDate(end.date)}
                        </span>
                      </span>
                      <span className="num shrink-0 font-semibold">
                        {x.price_is_approximate ? "≈ " : ""}
                        {fmt(x.price_paise)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      )}
    </section>
  );
}

function CurrentMembership({ d, fmt }: { d: Core; fmt: (p: number) => string }) {
  const m = d.membership!;
  const st = membershipStatus(m, d.today);
  const end = membershipEnd(m);
  const total = Math.max(daysBetween(m.start_date, end.date) + 1, 1);
  const elapsed = Math.min(Math.max(daysBetween(m.start_date, d.today) + 1, 0), total);
  return (
    <Card glow="teal" className="p-5 lg:col-span-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-teal uppercase">Current membership</p>
          <h3 className="mt-0.5 truncate text-[17px] font-semibold">{m.gym_name}</h3>
        </div>
        <Badge tone={st.state === "active" ? (st.daysLeft <= d.profile.membership_warning_days ? "warn" : "good") : st.state === "expired" ? "loss" : "info"}>
          {st.state === "active" ? "Active" : st.state === "expired" ? "Expired" : "Starts soon"}
        </Badge>
      </div>
      <p className="num mt-4 font-display text-3xl font-semibold tracking-tight">
        {st.state === "expired" ? 0 : Math.max(st.daysLeft, 0)}
        <span className="ml-2 text-sm font-medium text-muted">days left</span>
      </p>
      <ProgressBar className="mt-3" total={total} segments={[{ value: elapsed, className: "bg-teal", label: "Elapsed" }]} label={`${elapsed} of ${total} days elapsed`} />
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted">Started</dt>
          <dd className="num font-semibold">{formatDate(m.start_date)}</dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-xs text-muted">Ends {!end.confirmed && <Estimate>est.</Estimate>}</dt>
          <dd className="num font-semibold">{formatDate(end.date)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Price</dt>
          <dd className="num font-semibold">
            {m.price_is_approximate ? "≈ " : ""}
            {fmt(m.price_paise)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Payment</dt>
          <dd className={cx("font-semibold", m.payment_status !== "paid" && "text-warn")}>
            {m.payment_status === "paid" ? (m.paid_on ? `Paid ${formatDate(m.paid_on)}` : "Paid") : m.payment_status === "pending" ? "Pending" : "Not confirmed"}
          </dd>
        </div>
      </dl>
      {!end.confirmed && (
        <LinkButton href="/settings#membership" size="sm" className="mt-4">
          Confirm the contract end date
        </LinkButton>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Spending analytics
// ---------------------------------------------------------------------------
const DEFINITIONS: [string, string][] = [
  ["Spent", "Only payments marked paid (gym membership marked paid + PT payments − refunds). Pending or unconfirmed amounts are listed separately."],
  ["Cost per session", "Package price ÷ sessions purchased, fixed per package. Older packages always keep their own rate."],
  ["Missed PT value", "Confirmed chargeable PT absences × that package's rate. It is the value of prepaid sessions you didn't use — not new money spent that day."],
  ["Possible misses to confirm", "Scheduled PT days where you missed the gym but haven't confirmed whether the session was charged. Shown as an upper bound; never added to any loss."],
  ["Trainer-cancelled sessions", "Not a loss. They stay in your balance unless you record otherwise."],
  ["Not yet paid", "Package price minus payments recorded as paid, per package."],
  ["Effective cost per completed session", "PT money actually paid (minus refunds) ÷ PT sessions completed."],
  ["Credits", "Sessions the trainer added for free. They raise the balance; they are valued at the package rate for reference but are not cash."],
];

function Spending({ d }: { d: Core }) {
  const f = d.finance;
  const fmt = useMoneyFormatter("mem-spend");
  const fChart = useMoneyFormatter("mem-spend");
  const hidden = useMoneyHidden("mem-spend");
  const axisMoney = (v: number) => (hidden ? "" : compactRupees(v));
  const months = spendByMonth(d.memberships, d.ptEnabled ? d.payments : []);
  const missed = missedByMonth(d.ledger, d.packages);
  const att = gymAttendance(d.attendance, d.trackingStart ?? "2000-01-01", d.today);
  const pt = ptAttendance(d.attendance, d.trackingStart ?? "2000-01-01", d.today);
  const ptNet = f.ptPaid - f.ptRefunded;
  const unpaid = (d.ptEnabled ? f.ptOutstanding : 0) + f.gymUnconfirmed;
  const workouts = d.workouts.length;

  return (
    <section>
      <SectionHead
        id="spending"
        icon={<Wallet className="size-5" />}
        tone="bg-good-soft text-good"
        title="Spending"
        subtitle="Cash you actually paid, kept separate from the value of the sessions it bought."
        actions={<EyeToggle id="mem-spend" />}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card glow="good" className="p-5">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-good uppercase">Total spent</p>
          <p className="num mt-2 font-display text-[40px] leading-none font-semibold">{fmt(f.totalSpent)}</p>
          <ProgressBar
            className="mt-4"
            total={Math.max(f.gymPaid + Math.max(ptNet, 0), 1)}
            segments={[
              { value: f.gymPaid, className: "bg-teal", label: "Gym" },
              ...(d.ptEnabled ? [{ value: Math.max(ptNet, 0), className: "bg-pink", label: "Personal training" }] : []),
            ]}
          />
          <KeyValue
            className="mt-3"
            items={[
              { k: <Dot className="bg-teal">Gym membership</Dot>, v: fmt(f.gymPaid) },
              ...(d.ptEnabled ? [{ k: <Dot className="bg-pink">Personal training</Dot>, v: fmt(ptNet) }] : []),
              { k: "Not paid yet", v: <span className={unpaid ? "text-warn" : ""}>{fmt(unpaid)}</span> },
            ]}
          />
        </Card>

        {months.length > 0 ? (
          <ChartCard
            className="lg:col-span-2"
            title="Paid per month"
            legend={[{ label: "Gym", color: "var(--teal)" }, ...(d.ptEnabled ? [{ label: "Personal training", color: "var(--pink)" }] : [])]}
            table={{ columns: ["Month", "Gym", "PT", "Total"], rows: months.map((m) => [`${monthName(`${m.month}-01`)} ${m.month.slice(0, 4)}`, fChart(m.gym), fChart(m.pt), fChart(m.total)]) }}
          >
            <Bars
              data={months.map((m) => ({ month: m.month, gym: m.gym / 100, pt: m.pt / 100 }))}
              x="month"
              stacked
              xFormat={(m) => `${monthName(`${m}-01`, false)} ${m.slice(2, 4)}`}
              format={(v) => fChart(Math.round(v * 100))}
              axisFormat={axisMoney}
              allowDecimals
              bars={[{ key: "gym", name: "Gym", color: "var(--teal)" }, ...(d.ptEnabled ? [{ key: "pt", name: "Personal training", color: "var(--pink)" }] : [])]}
            />
          </ChartCard>
        ) : (
          <Card className="grid place-items-center p-6 text-center text-sm text-muted lg:col-span-2">
            Your monthly spending chart appears once a payment is marked paid.
          </Card>
        )}
      </div>

      <Card glow="violet" className="mt-4 grid grid-cols-2 gap-4 p-5 sm:grid-cols-3">
        {d.ptEnabled && (
          <Stat
            label={`Missed PT value · ${monthName(d.today)}`}
            value={fmt(f.missedValueThisMonth)}
            hint={f.missedSessionsThisMonth ? `${f.missedSessionsThisMonth} confirmed` : "none this month"}
            tone={f.missedValueThisMonth ? "accent" : undefined}
          />
        )}
        {d.ptEnabled && (
          <Stat
            label="Cost per completed PT session"
            value={f.effectiveCostPerCompleted === null ? "—" : fmt(f.effectiveCostPerCompleted)}
            hint={f.effectiveCostPerCompleted === null ? "after your first paid session" : "paid ÷ completed"}
          />
        )}
        <Stat label="Cost per logged workout" value={workouts && f.totalSpent ? fmt(Math.round(f.totalSpent / workouts)) : "—"} hint={workouts ? `${workouts} workouts` : "no workouts logged"} />
        <Stat label="Gym attendance" value={att.rate === null ? "—" : `${Math.round(att.rate * 100)}%`} hint={`${att.attended}/${att.attended + att.missed} confirmed days`} />
        {d.ptEnabled && <Stat label="PT attendance" value={pt.rate === null ? "—" : `${Math.round(pt.rate * 100)}%`} hint={`${pt.completed}/${pt.completed + pt.charged} sessions`} />}
        {d.ptEnabled && (
          <Stat
            label="Possible misses to confirm"
            value={f.pendingReviewDays ? `≤ ${fmt(f.pendingReviewValue)}` : "—"}
            hint={f.pendingReviewDays ? <Link href="/review" className="text-warn underline-offset-2 hover:underline">{f.pendingReviewDays} days → review</Link> : "nothing pending"}
          />
        )}
      </Card>

      <div className="mt-4 space-y-3">
        {d.ptEnabled && (
          <More title="Where the prepaid PT value went">
            <p className="text-xs text-muted">Value of sessions at each package&apos;s own rate — not cash flows.</p>
            <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Stat label="Completed" value={fmt(f.completedValue)} hint={`${f.completedSessions} sessions`} tone="good" />
              <Stat label="Missed (charged)" value={fmt(f.missedValue)} hint={`${f.missedSessions} sessions`} tone={f.missedValue ? "accent" : undefined} />
              <Stat label="Remaining" value={fmt(f.remainingValue)} hint={`${f.remainingSessions} sessions`} />
              <Stat label="Trainer cancelled" value={fmt(f.cancelledValue)} hint={`${f.cancelledSessions} · kept in balance`} />
              <Stat label="Refunded" value={fmt(f.refundedValue)} />
              <Stat label="Credited" value={fmt(f.creditedValue)} hint="free sessions" />
            </div>
            {missed.length > 0 && (
              <div className="mt-5 h-48">
                <Bars
                  data={missed.map((m) => ({ ...m, rupees: m.value / 100 }))}
                  x="month"
                  xFormat={(m) => `${monthName(`${m}-01`, false)} ${m.slice(2, 4)}`}
                  format={(v) => fChart(Math.round(v * 100))}
                  axisFormat={axisMoney}
                  allowDecimals
                  bars={[{ key: "rupees", name: "Missed value", color: "var(--chart-loss)" }]}
                />
              </div>
            )}
          </More>
        )}
        <More title="All payments">
          <Payments d={d} fmt={fmt} />
        </More>
        <More title="How every number is calculated" icon={<Info className="size-4 text-muted" />}>
          <dl className="space-y-3 text-sm">
            {DEFINITIONS.map(([k, v]) => (
              <div key={k}>
                <dt className="font-medium text-ink">{k}</dt>
                <dd className="text-muted">{v}</dd>
              </div>
            ))}
          </dl>
        </More>
      </div>
    </section>
  );
}

/** Axis labels: ₹800, ₹5k, ₹1.2L. */
function compactRupees(v: number) {
  const a = Math.abs(v);
  if (a >= 100000) return `₹${+(v / 100000).toFixed(1)}L`;
  if (a >= 1000) return `₹${+(v / 1000).toFixed(1)}k`;
  return `₹${Math.round(v)}`;
}

function Dot({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cx("size-2 rounded-full", className)} />
      {children}
    </span>
  );
}

function More({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <details className="group rounded-2xl border border-line bg-surface p-5 shadow-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold">
        {icon}
        {title}
        <ChevronDown className="ml-auto size-4 text-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

function Payments({ d, fmt }: { d: Core; fmt: (p: number) => string }) {
  const pt = d.ptEnabled ? d.payments : [];
  if (pt.length === 0 && d.memberships.length === 0) return <p className="text-sm text-muted">No payments recorded.</p>;
  return (
    <ul className="divide-y divide-line">
      {d.memberships.map((m) => (
        <li key={m.id} className="flex items-center justify-between gap-3 py-3 text-sm">
          <span className="min-w-0">
            <span className="block font-medium">{m.gym_name} membership</span>
            <span className="text-xs text-muted">
              {formatDate(m.start_date)} · {m.duration_months} months{m.paid_on ? ` · paid ${formatDate(m.paid_on)}` : ""}
            </span>
          </span>
          <span className="num flex shrink-0 items-center gap-2 font-semibold">
            {m.price_is_approximate ? "≈ " : ""}
            {fmt(m.price_paise)}
            <Badge tone={m.payment_status === "paid" ? "good" : "warn"}>{m.payment_status}</Badge>
          </span>
        </li>
      ))}
      {pt.map((p) => {
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
              <span className="num flex shrink-0 items-center gap-2 font-semibold">
                {p.kind === "refund" ? "−" : ""}
                {fmt(p.amount_paise)}
                <Badge tone={p.status === "paid" ? "good" : "warn"}>{p.kind === "refund" ? "refund" : p.status}</Badge>
                <ChevronRight className="size-4 text-faint" />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
