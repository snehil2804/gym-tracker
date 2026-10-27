"use client";

import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CalendarClock,
  Check,
  ChevronRight,
  Dumbbell,
  Flame,
  Info,
  Lightbulb,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import Link from "next/link";
import { DAY_STYLE, DayBadge, DayIcon } from "@/components/day-status";
import { useQuickLog } from "@/components/quick-log";
import { Badge, Button, Card, CardHeader, EmptyState, ErrorNote, Estimate, LinkButton, ProgressBar, Skeleton, Stat, cx } from "@/components/ui";
import { useCore, type Core } from "@/lib/data/derived";
import { classifyDay, PT_STATUS } from "@/lib/domain/attendance";
import { addDays, daysBetween, formatDate, formatShort, monthName, relativeDay, startOfWeek, weekdayName } from "@/lib/domain/dates";
import { buildInsights } from "@/lib/domain/insights";
import { formatMoney, sessionValue } from "@/lib/domain/money";
import { membershipEnd, membershipStatus } from "@/lib/domain/reminders";
import { currentStreak, gymAttendance, monthRange, workoutsBetween } from "@/lib/domain/stats";

export default function DashboardPage() {
  const { data, loading, error } = useCore();
  if (error) return <ErrorNote error={error} />;
  if (loading || !data) return <DashboardSkeleton />;
  return <Dashboard d={data} />;
}

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function Dashboard({ d }: { d: Core }) {
  const name = d.profile.display_name?.split(/[.\s_]/)[0];
  const insights = buildInsights({
    today: d.today,
    finance: d.finance,
    attendance: d.attendance,
    activePackage: d.current,
    forecast: d.forecast,
    reviewCount: d.reviewDays.length,
  }).filter((i) => i.id !== "review");

  return (
    <div className="anim-rise space-y-4">
      <header className="mb-2">
        <p className="text-sm text-muted">
          {weekdayName(d.today, true)}, {Number(d.today.slice(8))} {monthName(d.today)}
        </p>
        <h1 className="font-display text-[28px] leading-tight font-semibold tracking-tight sm:text-[32px]">
          {greeting()}
          {name ? `, ${name.charAt(0).toUpperCase()}${name.slice(1)}` : ""}
        </h1>
      </header>

      <TodayCard d={d} />
      <Reminders d={d} />

      <div className="grid gap-4 lg:grid-cols-3">
        <PackageCard d={d} />
        <MissedValueCard d={d} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <WeekCard d={d} />
        <MembershipCard d={d} />
        <MoneyCard d={d} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <RecentWorkouts d={d} />
        <Card className="pb-2">
          <CardHeader title="Insights" eyebrow="From your records" />
          {insights.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted">Insights appear once there are enough confirmed records to support them.</p>
          ) : (
            <ul className="divide-y divide-line px-5">
              {insights.map((i) => (
                <li key={i.id} className="flex gap-3 py-3 text-sm text-ink-2">
                  <Lightbulb className={cx("mt-0.5 size-4 shrink-0", i.tone === "loss" ? "text-accent" : i.tone === "good" ? "text-good" : "text-muted")} />
                  {i.href ? (
                    <Link href={i.href} className="hover:underline">
                      {i.text}
                    </Link>
                  ) : (
                    <span>{i.text}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function TodayCard({ d }: { d: Core }) {
  const quick = useQuickLog();
  const rec = d.todayRec;
  const kind = classifyDay(d.today, rec, d.dayCtx);
  const pkg = d.current;
  const ptToday = d.todayScheduled && pkg && pkg.start_date <= d.today && pkg.remaining > 0;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">Today</p>
          {rec ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <DayBadge kind={kind} className="text-xs" />
              <span className="text-sm text-muted">{PT_STATUS[rec.pt_status].short}</span>
            </div>
          ) : (
            <p className="mt-1 text-[15px] font-medium text-ink">
              {ptToday ? (
                <>
                  PT with {pkg!.trainer_name} is scheduled today. <span className="text-muted">Did you go?</span>
                </>
              ) : d.todayScheduled ? (
                "Training day. Did you go to the gym?"
              ) : (
                weekdayName(d.today) === "Sun" ? "Sunday is a rest day. Trained anyway? Log it." : `No PT scheduled on ${weekdayName(d.today, true)}s.`
              )}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
          {rec ? (
            <>
              <Button onClick={() => quick.open("menu", d.today)} icon={<RefreshCw className="size-4" />}>
                Change
              </Button>
              <LinkButton href={`/workouts/new?date=${d.today}`} variant="primary" icon={<Plus className="size-4" />}>
                Log workout
              </LinkButton>
            </>
          ) : (
            <>
              <Button variant="primary" size="lg" onClick={() => quick.open("went", d.today)} icon={<Check className="size-4" />}>
                I went
              </Button>
              <Button size="lg" onClick={() => quick.open("missed", d.today)} icon={<X className="size-4" />}>
                I missed
              </Button>
              <Button variant="ghost" className="col-span-2 sm:col-span-1" onClick={() => quick.open("menu", d.today)}>
                More options
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

function Reminders({ d }: { d: Core }) {
  const items = d.reminders.filter((r) => r.id !== "log-today" && r.id !== "weekly");
  if (!items.length) return null;
  const toneIcon = { loss: AlertTriangle, warn: AlertTriangle, info: Info, good: Bell };
  return (
    <Card className="divide-y divide-line">
      {items.map((r) => {
        const Icon = toneIcon[r.tone];
        const inner = (
          <div className="flex items-center gap-3 px-5 py-3">
            <Icon className={cx("size-4 shrink-0", r.tone === "loss" ? "text-accent" : r.tone === "warn" ? "text-warn" : "text-muted")} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">{r.title}</p>
              {r.detail && <p className="text-[13px] text-muted">{r.detail}</p>}
            </div>
            {r.href && <ChevronRight className="size-4 shrink-0 text-faint" />}
          </div>
        );
        return r.href ? (
          <Link key={r.id} href={r.href} className="block transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-surface-2/60">
            {inner}
          </Link>
        ) : (
          <div key={r.id}>{inner}</div>
        );
      })}
    </Card>
  );
}

function PackageCard({ d }: { d: Core }) {
  const p = d.current;
  if (!p) {
    return (
      <Card className="lg:col-span-2">
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
    <Card className="lg:col-span-2">
      <CardHeader
        eyebrow={upcoming ? "Upcoming PT package" : "PT package"}
        title={
          <span>
            {p.trainer_name}
            {p.label ? <span className="font-normal text-muted"> · {p.label}</span> : null}
          </span>
        }
        action={
          <LinkButton href={`/packages/${p.id}`} size="sm" variant="ghost">
            Details <ArrowRight className="size-3.5" />
          </LinkButton>
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
          <Stat label="Prepaid value left" value={formatMoney(sessionValue(Math.max(p.remaining, 0), p.price_paise, p.sessions_purchased))} hint={`${formatMoney(rate)} per session`} />
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

function MissedValueCard({ d }: { d: Core }) {
  const f = d.finance;
  const month = monthName(d.today);
  return (
    <Card tone={f.missedValueThisMonth > 0 ? "accent" : undefined} className="flex flex-col">
      <CardHeader eyebrow="Missed PT value" title={`${month}, confirmed`} />
      <div className="flex flex-1 flex-col px-5 pt-3 pb-5">
        <p className={cx("num font-display text-[40px] leading-none font-semibold tracking-tight", f.missedValueThisMonth > 0 ? "text-accent" : "text-ink")}>
          {formatMoney(f.missedValueThisMonth)}
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
              {formatMoney(f.missedValue)} · {f.missedSessions} {f.missedSessions === 1 ? "session" : "sessions"}
            </span>
          </div>
          {f.pendingReviewDays > 0 && (
            <Link href="/review" className="-mx-2 flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-surface-2">
              <span className="text-warn">
                {f.pendingReviewDays} possible {f.pendingReviewDays === 1 ? "miss" : "misses"} to confirm
              </span>
              <span className="num flex items-center gap-1 font-medium text-warn">
                up to {formatMoney(f.pendingReviewValue)} <ChevronRight className="size-3.5" />
              </span>
            </Link>
          )}
        </div>
        <LinkButton href="/finance" variant="ghost" size="sm" className="mt-auto self-start">
          Financial details <ArrowRight className="size-3.5" />
        </LinkButton>
      </div>
    </Card>
  );
}

function WeekCard({ d }: { d: Core }) {
  const ws = startOfWeek(d.today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const weekWorkouts = workoutsBetween(d.workouts, ws, addDays(ws, 6));
  const goal = d.profile.weekly_workout_goal;
  const trainedDays = days.filter((day) => {
    const k = classifyDay(day, d.byDate.get(day), d.dayCtx);
    return k === "trained" || k === "pt_only" || k === "gym_only" || weekWorkouts.some((w) => w.workout_date === day);
  }).length;
  const m = monthRange(d.today);
  const monthAtt = gymAttendance(d.attendance, m.from, d.today);
  const streak = currentStreak(d.attendance, d.today, [1, 2, 3, 4, 5, 6, 7].filter((x) => !d.scheduleDays.includes(x)));

  return (
    <Card>
      <CardHeader eyebrow="This week" title={`${trainedDays} of ${goal} training days`} />
      <div className="px-5 pt-4 pb-5">
        <div className="grid grid-cols-7 gap-1.5">
          {days.map((day) => {
            const k = classifyDay(day, d.byDate.get(day), d.dayCtx);
            const hasWorkout = weekWorkouts.some((w) => w.workout_date === day);
            const isToday = day === d.today;
            return (
              <Link
                key={day}
                href={`/calendar?d=${day}`}
                className="flex flex-col items-center gap-1"
                title={`${formatShort(day)} — ${k.replace("_", " ")}`}
              >
                <span className={cx("text-[11px] font-medium", isToday ? "text-ink" : "text-muted")}>{weekdayName(day).charAt(0)}</span>
                <span
                  className={cx(
                    "grid size-9 place-items-center rounded-xl text-xs",
                    DAY_STYLE[k].cell,
                    k === "future" && "border border-dashed border-line-strong",
                    isToday && "ring-2 ring-ink ring-offset-2 ring-offset-surface",
                  )}
                >
                  {k === "future" || k === "before" ? (
                    <span className="num text-[11px]">{Number(day.slice(8))}</span>
                  ) : hasWorkout && (k === "unverified" || k === "not_scheduled") ? (
                    <Dumbbell className="size-3.5 text-good" />
                  ) : (
                    <DayIcon kind={k} />
                  )}
                </span>
              </Link>
            );
          })}
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4">
          <Stat label="Workouts" value={weekWorkouts.length} hint="this week" />
          <Stat
            label="Attendance"
            value={monthAtt.rate === null ? "—" : `${Math.round(monthAtt.rate * 100)}%`}
            hint={monthAtt.rate === null ? "no confirmed days" : `${monthAtt.attended}/${monthAtt.attended + monthAtt.missed} this month`}
          />
          <Stat
            label="Streak"
            value={
              <span className="flex items-center gap-1">
                {streak}
                {streak > 1 && <Flame className="size-4 text-accent" />}
              </span>
            }
            hint="confirmed days"
          />
        </div>
      </div>
    </Card>
  );
}

function MembershipCard({ d }: { d: Core }) {
  const m = d.membership;
  if (!m) {
    return (
      <Card>
        <EmptyState icon={<CalendarClock className="size-5" />} title="No gym membership" action={<LinkButton href="/settings#membership">Add membership</LinkButton>}>
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
    <Card>
      <CardHeader
        eyebrow="Gym membership"
        title={m.gym_name}
        action={
          <Badge tone={st.state === "active" ? (st.daysLeft <= d.profile.membership_warning_days ? "warn" : "good") : st.state === "expired" ? "loss" : "info"}>
            {st.state === "active" ? "Active" : st.state === "expired" ? "Expired" : "Starts soon"}
          </Badge>
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
              {formatMoney(m.price_paise)}
              <span className="ml-1 text-xs font-normal text-muted">
                {m.payment_status === "paid" ? "paid" : m.payment_status === "pending" ? "pending" : "payment unconfirmed"}
              </span>
            </dd>
          </div>
        </dl>
        {!end.confirmed && (
          <LinkButton href="/settings#membership" size="sm" className="mt-4" block>
            Confirm the contract end date
          </LinkButton>
        )}
      </div>
    </Card>
  );
}

function MoneyCard({ d }: { d: Core }) {
  const f = d.finance;
  return (
    <Card>
      <CardHeader
        eyebrow="Money"
        title="Spent so far"
        action={
          <LinkButton href="/finance" size="sm" variant="ghost">
            All <ArrowRight className="size-3.5" />
          </LinkButton>
        }
      />
      <div className="px-5 pt-3 pb-5">
        <p className="num font-display text-3xl font-semibold tracking-tight">{formatMoney(f.totalSpent)}</p>
        <p className="mt-1 text-xs text-muted">Only payments confirmed as paid.</p>
        <dl className="mt-4 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Gym</dt>
            <dd className="num font-medium">{formatMoney(f.gymPaid)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">PT payments</dt>
            <dd className="num font-medium">{formatMoney(f.ptPaid - f.ptRefunded)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Not yet recorded as paid</dt>
            <dd className="num font-medium text-warn">{formatMoney(f.ptOutstanding + f.gymUnconfirmed)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Cost per completed PT session</dt>
            <dd className="num font-medium">{f.effectiveCostPerCompleted === null ? "—" : formatMoney(f.effectiveCostPerCompleted)}</dd>
          </div>
        </dl>
      </div>
    </Card>
  );
}

function RecentWorkouts({ d }: { d: Core }) {
  const recent = d.workouts.slice(0, 4);
  return (
    <Card className="lg:col-span-2">
      <CardHeader
        eyebrow="Workouts"
        title="Recent"
        action={
          <LinkButton href="/workouts/new" size="sm" variant="ghost" icon={<Plus className="size-3.5" />}>
            Log
          </LinkButton>
        }
      />
      {recent.length === 0 ? (
        <EmptyState icon={<Dumbbell className="size-5" />} title="No workouts logged yet" action={<LinkButton href="/workouts/new" variant="primary">Log your first workout</LinkButton>}>
          Describe a session in a sentence or add exercises, sets and weights. Your charts build from what you log.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line px-5 pb-2">
          {recent.map((w) => (
            <li key={w.id}>
              <Link href={`/workouts/${w.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 hover:bg-surface-2/60">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-center leading-none">
                  <span className="num text-[15px] font-semibold">{Number(w.workout_date.slice(8))}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{w.title || w.muscle_groups.join(", ") || "Workout"}</span>
                  <span className="block truncate text-xs text-muted">
                    {formatShort(w.workout_date)} · {w.exercises.length} {w.exercises.length === 1 ? "exercise" : "exercises"}
                    {w.duration_min ? ` · ${w.duration_min} min` : ""}
                    {w.with_trainer ? " · with trainer" : ""}
                  </span>
                </span>
                <ChevronRight className="size-4 text-faint" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-24" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 lg:col-span-2" />
        <Skeleton className="h-72" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
    </div>
  );
}
