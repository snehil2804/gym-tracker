"use client";

import {
  AlertTriangle,
  Bell,
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
import { Button, Card, CardHeader, EmptyState, ErrorNote, LinkButton, Skeleton, Stat, cx } from "@/components/ui";
import { useGame } from "@/components/streak-game";
import { TodayWorkout } from "@/components/planner/today-workout";
import { useCore, type Core } from "@/lib/data/derived";
import { classifyDay, PT_STATUS } from "@/lib/domain/attendance";
import { addDays, formatShort, monthName, startOfWeek, weekdayName } from "@/lib/domain/dates";
import { buildInsights } from "@/lib/domain/insights";
import { EyeToggle, useMoneyHidden } from "@/components/preferences";
import { gymAttendance, monthRange, workoutsBetween } from "@/lib/domain/stats";

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
    activePackage: d.ptEnabled ? d.current : undefined,
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
      <TodayWorkout d={d} />
      <Reminders d={d} />

      <div className="grid gap-4 lg:grid-cols-3">
        <WeekCard d={d} />
        <RecentWorkouts d={d} />
        <Card glow="warn" className="pb-2 lg:col-span-3">
          <CardHeader title="Insights" eyebrow="From your records" action={insights.length ? <EyeToggle id="dash-insights" /> : undefined} />
          {insights.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted">Insights appear once there are enough confirmed records to support them.</p>
          ) : (
            <ul className="divide-y divide-line px-5">
              {insights.map((i) => (
                <li key={i.id} className="flex gap-3 py-3 text-sm text-ink-2">
                  <Lightbulb className={cx("mt-0.5 size-4 shrink-0", i.tone === "loss" ? "text-accent" : i.tone === "good" ? "text-good" : "text-muted")} />
                  {i.href ? (
                    <Link href={i.href} className="hover:underline">
                      <InsightText text={i.text} />
                    </Link>
                  ) : (
                    <span>
                      <InsightText text={i.text} />
                    </span>
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
              ) : !d.ptEnabled ? (
                "Did you go to the gym today?"
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
              <LinkButton href="#today-workout" variant="primary" icon={<Plus className="size-4" />}>
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
  const game = useGame(d);
  const streak = game.streak;

  return (
    <Card glow="info">
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
                {streak > 1 && <Flame className="size-4 text-teal" />}
              </span>
            }
            hint={game.weekStreak > 0 ? `${game.weekStreak} golden ${game.weekStreak === 1 ? "week" : "weeks"}` : `days · goal ${goal}/week`}
          />
        </div>
      </div>
    </Card>
  );
}

function RecentWorkouts({ d }: { d: Core }) {
  const recent = d.workouts.slice(0, 4);
  return (
    <Card glow="good" className="lg:col-span-2">
      <CardHeader
        eyebrow="Workouts"
        title="Recent"
        action={
          <LinkButton href="#today-workout" size="sm" variant="ghost" icon={<Plus className="size-3.5" />}>
            Log
          </LinkButton>
        }
      />
      {recent.length === 0 ? (
        <EmptyState icon={<Dumbbell className="size-5" />} title="No workouts logged yet" action={<LinkButton href="#today-workout" variant="primary">Log today&apos;s workout</LinkButton>}>
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

/** Insight sentence with rupee amounts masked when the insights card is hidden. */
function InsightText({ text }: { text: string }) {
  const hidden = useMoneyHidden("dash-insights");
  return <>{hidden ? text.replace(/₹[\d,.]+/g, "₹••••") : text}</>;
}
