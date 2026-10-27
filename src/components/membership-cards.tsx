"use client";

import { ArrowRight, CalendarClock, ChevronRight, Dumbbell, RefreshCw } from "lucide-react";
import Link from "next/link";
import { EyeToggle, Money } from "@/components/preferences";
import { Badge, Card, CardHeader, EmptyState, Estimate, LinkButton, ProgressBar, Stat, cx } from "@/components/ui";
import type { Core } from "@/lib/data/derived";
import { daysBetween, formatDate, formatShort, monthName, relativeDay } from "@/lib/domain/dates";
import { sessionValue } from "@/lib/domain/money";
import { membershipEnd, membershipStatus } from "@/lib/domain/reminders";

/*
  Summary cards shown on the Membership overview (they used to sit on Today).
  Wrap each in <MoneyScope id=…> so its eye toggle hides its amounts.
*/

export function PackageCard({ d }: { d: Core }) {
  const p = d.current;
  if (!p) {
    return (
      <Card glow="info" className="lg:col-span-2">
        <EmptyState
          icon={<Dumbbell className="size-5" />}
          title="No PT package yet"
          action={<LinkButton href="/packages/new" variant="primary">Add a package</LinkButton>}
        >
          Add the package you bought to track sessions, value and renewals.
        </EmptyState>
      </Card>
    );
  }
  const upcoming = p.start_date > d.today;
  const used = p.completed + p.forfeited;
  const total = p.sessions_purchased + p.credited + p.transferred_in + p.adjusted;
  const rate = sessionValue(1, p.price_paise, p.sessions_purchased);
  const f = d.forecast;
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;

  return (
    <Card glow="info" className="lg:col-span-2">
      <CardHeader
        eyebrow={upcoming ? "Upcoming PT package" : "PT package"}
        title={
          <span>
            {p.trainer_name}
            {p.label ? <span className="font-normal text-muted"> · {p.label}</span> : null}
          </span>
        }
        action={
          <span className="flex items-center gap-1">
            <EyeToggle id="dash-package" />
            <LinkButton href={`/packages/${p.id}`} size="sm" variant="ghost">
              Details <ArrowRight className="size-3.5" />
            </LinkButton>
          </span>
        }
      />
      <div className="px-5 pt-3 pb-5">
        <div className="flex items-end justify-between gap-4">
          <p className="num font-display text-[44px] leading-none font-semibold tracking-tight">
            {p.remaining}
            <span className="ml-2 text-base font-medium text-muted">of {total} sessions left</span>
          </p>
          <p className="num hidden text-right text-sm text-muted sm:block">{pct}% used</p>
        </div>
        <ProgressBar
          className="mt-4"
          total={total}
          segments={[
            { value: p.completed, className: "bg-good", label: "Completed" },
            { value: p.forfeited + p.expired, className: "bg-accent", label: "Missed (charged)" },
            { value: p.refunded + p.transferred_out, className: "bg-info", label: "Refunded / moved" },
          ]}
        />
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-good" />{p.completed} completed</span>
          <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-accent" />{p.forfeited} missed (charged)</span>
          <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-info" />{p.trainer_cancelled} trainer-cancelled</span>
          {p.client_cancelled > 0 && <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-ink-2" />{p.client_cancelled} cancelled by you</span>}
          <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-violet" />{p.rescheduled} rescheduled</span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-4">
          <Stat label="Prepaid value left" value={<Money paise={sessionValue(Math.max(p.remaining, 0), p.price_paise, p.sessions_purchased)} />} hint={<><Money paise={rate} /> per session</>} />
          <Stat
            label="Next session"
            value={f?.nextSession && p.remaining > 0 ? relativeDay(f.nextSession, d.today) : "—"}
            hint={f?.nextSession && p.remaining > 0 ? formatShort(f.nextSession) : p.remaining <= 0 ? "Package used up" : undefined}
          />
          <Stat
            label={
              <span className="flex items-center gap-1.5">
                Last session <Estimate />
              </span>
            }
            value={f?.finalDate ? formatDate(f.finalDate).replace(/ \d{4}$/, "") : "—"}
            hint={f?.finalDate ? `If every planned session happens` : undefined}
          />
          <Stat
            label="Expiry"
            value={p.expiry_date ? formatDate(p.expiry_date).replace(/ \d{4}$/, "") : "None"}
            hint={f?.runsPastExpiry ? <span className="text-accent">{f.unusedAtExpiry} may go unused</span> : p.expiry_date ? `${Math.max(daysBetween(d.today, p.expiry_date), 0)} days left` : "Sessions don't expire"}
          />
        </div>
        {(p.remaining <= 5 || (f?.finalDate && daysBetween(d.today, f.finalDate) <= d.profile.renewal_warning_days)) && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-warn-soft px-4 py-3">
            <p className="text-sm font-medium text-warn">
              {p.remaining <= 0 ? "This package is used up." : `Only ${p.remaining} ${p.remaining === 1 ? "session" : "sessions"} left — time to plan your renewal.`}
            </p>
            <LinkButton href={`/packages/new?renew=${p.id}`} size="sm" variant="primary" icon={<RefreshCw className="size-3.5" />}>
              Renew PT package
            </LinkButton>
          </div>
        )}
      </div>
    </Card>
  );
}

export function MissedValueCard({ d }: { d: Core }) {
  const f = d.finance;
  const month = monthName(d.today);
  return (
    <Card glow="accent" tone={f.missedValueThisMonth > 0 ? "accent" : undefined} className="flex flex-col">
      <CardHeader eyebrow="Missed PT value" title={`${month}, confirmed`} action={<EyeToggle id="dash-missed" />} />
      <div className="flex flex-1 flex-col px-5 pt-3 pb-5">
        <p className={cx("num font-display text-[40px] leading-none font-semibold tracking-tight", f.missedValueThisMonth > 0 ? "text-accent" : "text-ink")}>
          <Money paise={f.missedValueThisMonth} />
        </p>
        <p className="mt-2 text-sm text-ink-2">
          {f.missedSessionsThisMonth === 0
            ? "No confirmed chargeable PT sessions missed this month."
            : `worth of PT sessions missed this month (${f.missedSessionsThisMonth} ${f.missedSessionsThisMonth === 1 ? "session" : "sessions"}).`}
        </p>
        <p className="mt-1 text-xs text-muted">Value of prepaid sessions you didn&apos;t use — not new money spent.</p>
        <div className="mt-4 space-y-2 border-t border-line pt-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">All time</span>
            <span className="num font-medium">
              <Money paise={f.missedValue} /> · {f.missedSessions} {f.missedSessions === 1 ? "session" : "sessions"}
            </span>
          </div>
          {f.pendingReviewDays > 0 && (
            <Link href="/review" className="-mx-2 flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-surface-2">
              <span className="text-warn">
                {f.pendingReviewDays} possible {f.pendingReviewDays === 1 ? "miss" : "misses"} to confirm
              </span>
              <span className="num flex items-center gap-1 font-medium text-warn">
                up to <Money paise={f.pendingReviewValue} /> <ChevronRight className="size-3.5" />
              </span>
            </Link>
          )}
        </div>
        <LinkButton href="/membership/spending" variant="ghost" size="sm" className="mt-auto self-start">
          Financial details <ArrowRight className="size-3.5" />
        </LinkButton>
      </div>
    </Card>
  );
}


export function MembershipCard({ d }: { d: Core }) {
  const m = d.membership;
  if (!m) {
    return (
      <Card glow="teal">
        <EmptyState icon={<CalendarClock className="size-5" />} title="No gym membership" action={<LinkButton href="/membership/gym">Add membership</LinkButton>}>
          Add your membership to track its expiry.
        </EmptyState>
      </Card>
    );
  }
  const st = membershipStatus(m, d.today);
  const end = membershipEnd(m);
  const total = Math.max(daysBetween(m.start_date, end.date) + 1, 1);
  const elapsed = Math.min(Math.max(daysBetween(m.start_date, d.today) + 1, 0), total);
  return (
    <Card glow="teal">
      <CardHeader
        eyebrow="Gym membership"
        title={m.gym_name}
        action={
          <span className="flex items-center gap-1">
          <EyeToggle id="dash-membership" />
          <Badge tone={st.state === "active" ? (st.daysLeft <= d.profile.membership_warning_days ? "warn" : "good") : st.state === "expired" ? "loss" : "info"}>
            {st.state === "active" ? "Active" : st.state === "expired" ? "Expired" : "Starts soon"}
          </Badge>
          </span>
        }
      />
      <div className="px-5 pt-3 pb-5">
        <p className="num font-display text-3xl font-semibold tracking-tight">
          {st.state === "expired" ? 0 : Math.max(st.daysLeft, 0)}
          <span className="ml-2 text-sm font-medium text-muted">days left</span>
        </p>
        <ProgressBar className="mt-3" total={total} segments={[{ value: elapsed, className: "bg-ink", label: "Elapsed" }]} label={`${elapsed} of ${total} days elapsed`} />
        <dl className="mt-4 space-y-1.5 text-sm">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted">Ends</dt>
            <dd className="num flex items-center gap-2 font-medium">
              {formatDate(end.date)} {end.confirmed ? <Badge tone="good">Confirmed</Badge> : <Estimate>Estimated</Estimate>}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted">Price</dt>
            <dd className="num font-medium">
              {m.price_is_approximate ? "≈ " : ""}
              <Money paise={m.price_paise} />
              <span className="ml-1 text-xs font-normal text-muted">
                {m.payment_status === "paid" ? "paid" : m.payment_status === "pending" ? "pending" : "payment unconfirmed"}
              </span>
            </dd>
          </div>
        </dl>
        {!end.confirmed && (
          <LinkButton href="/membership/gym" size="sm" className="mt-4" block>
            Confirm the contract end date
          </LinkButton>
        )}
      </div>
    </Card>
  );
}

export function MoneyCard({ d }: { d: Core }) {
  const f = d.finance;
  return (
    <Card glow="good">
      <CardHeader
        eyebrow="Money"
        title="Spent so far"
        action={
          <span className="flex items-center gap-1">
            <EyeToggle id="dash-money" />
            <LinkButton href="/membership/spending" size="sm" variant="ghost">
              All <ArrowRight className="size-3.5" />
            </LinkButton>
          </span>
        }
      />
      <div className="px-5 pt-3 pb-5">
        <p className="num font-display text-3xl font-semibold tracking-tight"><Money paise={f.totalSpent} /></p>
        <p className="mt-1 text-xs text-muted">Only payments confirmed as paid.</p>
        <dl className="mt-4 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Gym</dt>
            <dd className="num font-medium"><Money paise={f.gymPaid} /></dd>
          </div>
          {d.ptEnabled && (
          <div className="flex justify-between">
            <dt className="text-muted">PT payments</dt>
            <dd className="num font-medium"><Money paise={f.ptPaid - f.ptRefunded} /></dd>
          </div>
          )}
          <div className="flex justify-between">
            <dt className="text-muted">Not yet recorded as paid</dt>
            <dd className="num font-medium text-warn"><Money paise={(d.ptEnabled ? f.ptOutstanding : 0) + f.gymUnconfirmed} /></dd>
          </div>
          {d.ptEnabled && (
          <div className="flex justify-between">
            <dt className="text-muted">Cost per completed PT session</dt>
            <dd className="num font-medium">{f.effectiveCostPerCompleted === null ? "—" : <Money paise={f.effectiveCostPerCompleted} />}</dd>
          </div>
          )}
        </dl>
      </div>
    </Card>
  );
}

