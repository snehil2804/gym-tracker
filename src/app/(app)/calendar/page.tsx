"use client";

import { ChevronLeft, ChevronRight, ListChecks } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { DayEditor } from "@/components/day-editor";
import { DAY_STYLE, DayIcon, DayLegend } from "@/components/day-status";
import { useQuickLog } from "@/components/quick-log";
import { Button, Card, ErrorNote, LinkButton, PageHeader, Skeleton, cx } from "@/components/ui";
import { useCore } from "@/lib/data/derived";
import { blocksOn, classifyDay, DAY_KIND, type DayKind } from "@/lib/domain/attendance";
import { addMonths, endOfMonth, isISODate, monthGrid, monthName, startOfMonth, weekdayLabel } from "@/lib/domain/dates";
import { formatMoney } from "@/lib/domain/money";
import { ledgerValue } from "@/lib/domain/finance";

export default function CalendarPage() {
  const { data: d, loading, error } = useCore();
  const params = useSearchParams();
  const router = useRouter();
  const quick = useQuickLog();
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
    const byId = new Map(d.packages.map((p) => [p.id, p]));
    const missed = ledgerValue(d.ledger, byId, (e) => e.kind === "forfeited" && !!e.session_date && e.session_date.startsWith(month.slice(0, 7)));
    return { counts, missed };
  }, [d, month]);

  if (error) return <ErrorNote error={error} />;
  if (loading || !d || !month || !summary) return <Skeleton className="h-[560px]" />;

  const grid = monthGrid(month);
  const close = () => {
    setSelected(null);
    if (initial) router.replace("/calendar");
  };

  return (
    <div className="anim-rise">
      <PageHeader
        title="Attendance"
        subtitle="Tap a day to review or correct it. Unknown days are never counted as attended or missed."
        actions={
          d.reviewDays.length > 0 ? (
            <LinkButton href="/review" icon={<ListChecks className="size-4" />}>
              Review {d.reviewDays.length} days
            </LinkButton>
          ) : null
        }
      />

      <Card className="p-3 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setAnchor(addMonths(month, -1))} aria-label="Previous month">
            <ChevronLeft className="size-4" />
          </Button>
          <div className="text-center">
            <h2 className="font-display text-lg font-semibold">
              {monthName(month)} {month.slice(0, 4)}
            </h2>
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

        <div className="grid grid-cols-7 gap-1 sm:gap-2" role="grid" aria-label={`${monthName(month)} ${month.slice(0, 4)}`}>
          {[1, 2, 3, 4, 5, 6, 7].map((w) => (
            <div key={w} className="pb-1 text-center text-[11px] font-semibold tracking-wide text-muted uppercase" role="columnheader">
              <span className="sm:hidden">{weekdayLabel(w).charAt(0)}</span>
              <span className="hidden sm:inline">{weekdayLabel(w)}</span>
            </div>
          ))}
          {grid.map((day) => {
            const inMonth = day >= month && day <= endOfMonth(month);
            const rec = d.byDate.get(day);
            const kind = classifyDay(day, rec, d.dayCtx);
            const s = DAY_STYLE[kind];
            const blocked = blocksOn(day, d.blocks).length > 0;
            const hasWorkout = d.workouts.some((w) => w.workout_date === day);
            const isToday = day === d.today;
            return (
              <button
                key={day}
                role="gridcell"
                onClick={() => (day > d.today ? setSelected(day) : setSelected(day))}
                aria-label={`${day}: ${DAY_KIND[kind].label}${hasWorkout ? ", workout logged" : ""}`}
                className={cx(
                  "relative flex aspect-square min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl text-sm transition-transform active:scale-95 sm:aspect-auto sm:h-20 sm:items-start sm:justify-between sm:p-2",
                  inMonth ? s.cell : "opacity-30",
                  kind === "future" && "bg-surface-2/50",
                  kind === "not_scheduled" && "bg-surface-2/40",
                  isToday && "ring-2 ring-ink ring-offset-1 ring-offset-surface",
                  "hover:brightness-95",
                )}
              >
                <span className={cx("num text-[13px] font-semibold", kind === "future" ? "text-ink-2" : "")}>{Number(day.slice(8))}</span>
                {kind !== "future" && kind !== "before" && <DayIcon kind={kind} className="size-3.5 sm:size-4" />}
                <span className="absolute top-1 right-1 flex gap-0.5">
                  {hasWorkout && <i className="size-1.5 rounded-full bg-ink" title="Workout logged" />}
                  {blocked && <i className="size-1.5 rounded-full bg-rest" title="Planned break" />}
                </span>
                <span className="hidden max-w-full truncate text-[10px] font-medium sm:block">{kind === "future" || kind === "before" ? "" : DAY_KIND[kind].label}</span>
              </button>
            );
          })}
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h3 className="mb-3 text-[13px] font-semibold tracking-[0.06em] text-muted uppercase">Legend</h3>
          <DayLegend />
          <p className="mt-3 text-xs text-muted">
            <i className="mr-1 inline-block size-1.5 rounded-full bg-ink align-middle" /> workout logged ·
            <i className="mx-1 inline-block size-1.5 rounded-full bg-rest align-middle" /> planned break (vacation, pause, holiday)
          </p>
        </Card>
        <Card className="p-5">
          <h3 className="mb-3 text-[13px] font-semibold tracking-[0.06em] text-muted uppercase">{monthName(month)} summary</h3>
          <dl className="space-y-1.5 text-sm">
            {(["trained", "pt_only", "gym_only", "charged", "missed", "missed_unconfirmed", "cancelled", "self_cancelled", "rescheduled", "rest", "unverified"] as DayKind[])
              .filter((k) => summary.counts.get(k))
              .map((k) => (
                <div key={k} className="flex items-center justify-between">
                  <dt className="flex items-center gap-2 text-ink-2">
                    <span className={cx("grid size-5 place-items-center rounded-md", DAY_STYLE[k].cell)}>
                      <DayIcon kind={k} className="size-3" />
                    </span>
                    {DAY_KIND[k].label}
                  </dt>
                  <dd className="num font-semibold">{summary.counts.get(k)}</dd>
                </div>
              ))}
            <div className="mt-2 flex justify-between border-t border-line pt-2">
              <dt className="text-muted">Missed PT value (confirmed)</dt>
              <dd className={cx("num font-semibold", summary.missed.value > 0 && "text-accent")}>{formatMoney(summary.missed.value)}</dd>
            </div>
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
