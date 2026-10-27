"use client";

import { ChevronLeft, ChevronRight, Crown, Flame, ListChecks } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { DayEditor } from "@/components/day-editor";
import { DAY_STYLE, DayIcon, DayLegend } from "@/components/day-status";
import { useQuickLog } from "@/components/quick-log";
import { Button, Card, ErrorNote, LinkButton, PageHeader, Skeleton, cx } from "@/components/ui";
import { useCore, type Core } from "@/lib/data/derived";
import { blocksOn, classifyDay, dayLabel, PT_ONLY_KINDS, type DayKind } from "@/lib/domain/attendance";
import { addMonths, endOfMonth, isISODate, monthGrid, monthName, startOfMonth, weekdayLabel } from "@/lib/domain/dates";
import { GamePanel, PerfectMonthBanner, useGame } from "@/components/streak-game";
import { addDays, isoWeekday, startOfWeek } from "@/lib/domain/dates";

export default function CalendarPage() {
  const { data: d, loading, error } = useCore();
  const params = useSearchParams();
  const initial = params.get("d");
  const [anchor, setAnchor] = useState<string | null>(initial && isISODate(initial) ? startOfMonth(initial) : null);
  const [selected, setSelected] = useState<string | null>(initial && isISODate(initial) ? initial : null);

  const month = anchor ?? (d ? startOfMonth(d.today) : null);

  const summary = useMemo(() => {
    if (!d || !month) return null;
    const counts = new Map<DayKind, number>();
    for (const day of monthGrid(month)) {
      if (day < month || day > endOfMonth(month)) continue;
      const k = classifyDay(day, d.byDate.get(day), d.dayCtx);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return { counts };
  }, [d, month]);

  if (error) return <ErrorNote error={error} />;
  if (loading || !d || !month || !summary) return <Skeleton className="h-[560px]" />;
  return <CalendarView d={d} month={month} summary={summary} selected={selected} setSelected={setSelected} setAnchor={setAnchor} initial={initial} />;
}

function CalendarView({
  d,
  month,
  summary,
  selected,
  setSelected,
  setAnchor,
  initial,
}: {
  d: Core;
  month: string;
  summary: { counts: Map<DayKind, number> };
  selected: string | null;
  setSelected: (v: string | null) => void;
  setAnchor: (v: string | null) => void;
  initial: string | null;
}) {
  const router = useRouter();
  const quick = useQuickLog();
  const game = useGame(d);
  const monthResult = game.months.get(month.slice(0, 7));

  const grid = monthGrid(month);
  const close = () => {
    setSelected(null);
    if (initial) router.replace("/calendar");
  };

  return (
    <div className="anim-rise">
      <PageHeader
        title="Attendance"
        subtitle="Turn every training day green. Rest days never break your streak; misses cost XP."
        actions={
          d.reviewDays.length > 0 ? (
            <LinkButton href="/review" icon={<ListChecks className="size-4" />}>
              Review {d.reviewDays.length} days
            </LinkButton>
          ) : null
        }
      />

      <GamePanel game={game} month={month} today={d.today} goal={d.profile.weekly_workout_goal} />
      {monthResult?.perfect && <PerfectMonthBanner month={month} />}

      <Card className={cx("p-3 sm:p-5", monthResult?.perfect && "golden-month")}>
        <div className="mb-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setAnchor(addMonths(month, -1))} aria-label="Previous month">
            <ChevronLeft className="size-4" />
          </Button>
          <div className="text-center">
            <h2 className="flex items-center justify-center gap-1.5 font-display text-lg font-semibold">
              {monthResult?.perfect && <Crown className="size-4 text-[#d4a017]" />}
              {monthName(month)} {month.slice(0, 4)}
            </h2>
            {monthResult?.perfect && <p className="text-xs font-semibold text-[#b8860b]">Golden month</p>}
            {month !== startOfMonth(d.today) && (
              <button className="text-xs text-muted underline-offset-2 hover:underline" onClick={() => setAnchor(startOfMonth(d.today))}>
                Back to today
              </button>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setAnchor(addMonths(month, 1))} aria-label="Next month">
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <div key={month} className="grid grid-cols-7 gap-1 sm:gap-2" role="grid" aria-label={`${monthName(month)} ${month.slice(0, 4)}`}>
          {[1, 2, 3, 4, 5, 6, 7].map((w) => (
            <div key={w} className="pb-1 text-center text-[11px] font-semibold tracking-wide text-muted uppercase" role="columnheader">
              <span className="sm:hidden">{weekdayLabel(w).charAt(0)}</span>
              <span className="hidden sm:inline">{weekdayLabel(w)}</span>
            </div>
          ))}
          {grid.map((day, idx) => {
            const inMonth = day >= month && day <= endOfMonth(month);
            const rec = d.byDate.get(day);
            const kind = classifyDay(day, rec, d.dayCtx);
            const s = DAY_STYLE[kind];
            const blocked = blocksOn(day, d.blocks).length > 0;
            const hasWorkout = d.workouts.some((w) => w.workout_date === day);
            const isToday = day === d.today;
            const g = game.days.get(day);
            const run = game.chain.get(day);
            const linked = inMonth && run !== undefined && isoWeekday(day) !== 1 && game.chain.get(addDays(day, -1)) === run;
            const won = g === "won" || g === "double";
            const goldWeek = inMonth && !!game.weeks.get(startOfWeek(day))?.golden && g !== "future";
            return (
              <button
                key={day}
                role="gridcell"
                onClick={() => (day > d.today ? setSelected(day) : setSelected(day))}
                aria-label={`${day}: ${dayLabel(kind, d.ptEnabled)}${hasWorkout ? ", workout logged" : ""}`}
                style={{ ["--i" as string]: idx }}
                className={cx(
                  "cal-cell relative flex aspect-square min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl text-sm active:scale-95 sm:aspect-auto sm:h-20 sm:items-start sm:justify-between sm:p-2",
                  inMonth ? s.cell : "opacity-30",
                  goldWeek && (won ? "gold-win" : "gold-day"),
                  won && inMonth && "cal-won",
                  kind === "future" && "bg-surface-2/50",
                  kind === "not_scheduled" && "bg-surface-2/40",
                  isToday && "ring-2 ring-ink ring-offset-1 ring-offset-surface",
                  isToday && game.todayOpen && "today-chase",
                  inMonth && won && run !== undefined && "trail-win",
                  inMonth && run !== undefined && !won && "trail-bridge",
                )}
              >
                {linked && <span aria-hidden className="trail-link" />}
                <span className={cx("num text-[13px] font-semibold", kind === "future" ? "text-ink-2" : "")}>{Number(day.slice(8))}</span>
                {kind !== "future" && kind !== "before" && <DayIcon kind={kind} className="size-3.5 sm:size-4" />}
                {isToday && game.streak > 0 && (
                  <span className="absolute -top-1.5 -left-1.5 z-10 grid size-5 place-items-center rounded-full bg-brand text-white shadow" title={`${game.streak}-day streak`}>
                    <Flame className="size-3" />
                  </span>
                )}
                {goldWeek && isoWeekday(day) === 7 && (
                  <span className="absolute -top-1.5 -right-1.5 z-10 grid size-5 place-items-center rounded-full bg-[linear-gradient(160deg,#ffe08a,#e9a417)] text-[#3a2a00] shadow" title="Golden week">
                    <Crown className="size-3" />
                  </span>
                )}
                <span className="absolute top-1 right-1 flex gap-0.5">
                  {hasWorkout && <i className="size-1.5 rounded-full bg-ink" title="Workout logged" />}
                  {blocked && <i className="size-1.5 rounded-full bg-rest" title="Planned break" />}
                </span>
                <span className="hidden max-w-full truncate text-[10px] font-medium sm:block" title={g === "skip" ? "Free off-day — within your weekly goal, doesn't break the streak" : undefined}>
                  {kind === "future" || kind === "before" ? "" : g === "skip" ? "Free off-day" : dayLabel(kind, d.ptEnabled)}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card glow="info" className="p-5 lg:col-span-2">
          <h3 className="mb-3 text-[13px] font-semibold tracking-[0.06em] text-muted uppercase">Legend</h3>
          <DayLegend />
          <p className="mt-3 text-xs text-muted">
            <i className="mr-1 inline-block size-1.5 rounded-full bg-ink align-middle" /> workout logged ·
            <i className="mx-1 inline-block size-1.5 rounded-full bg-rest align-middle" /> planned break (vacation, pause, holiday)
          </p>
        </Card>
        <Card glow="info" className="p-5">
          <h3 className="mb-3 text-[13px] font-semibold tracking-[0.06em] text-muted uppercase">{monthName(month)} summary</h3>
          <dl className="space-y-1.5 text-sm">
            {(["trained", "pt_only", "gym_only", "charged", "missed", "missed_unconfirmed", "cancelled", "self_cancelled", "rescheduled", "rest", "unverified"] as DayKind[])
              .filter((k) => d.ptEnabled || !PT_ONLY_KINDS.includes(k))
              .filter((k) => summary.counts.get(k))
              .map((k) => (
                <div key={k} className="flex items-center justify-between">
                  <dt className="flex items-center gap-2 text-ink-2">
                    <span className={cx("grid size-5 place-items-center rounded-md", DAY_STYLE[k].cell)}>
                      <DayIcon kind={k} className="size-3" />
                    </span>
                    {dayLabel(k, d.ptEnabled)}
                  </dt>
                  <dd className="num font-semibold">{summary.counts.get(k)}</dd>
                </div>
              ))}
          </dl>
          <Button variant="primary" block className="mt-4" onClick={() => quick.open("menu", d.today)}>
            Log today
          </Button>
        </Card>
      </div>

      {selected && <DayEditor key={selected} d={d} date={selected} onClose={close} />}
    </div>
  );
}
