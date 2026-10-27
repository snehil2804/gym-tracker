"use client";

import { Ban, CalendarX, Check, CheckCheck, Dumbbell, PartyPopper, Pencil, X } from "lucide-react";
import { useMemo, useState } from "react";
import { DayEditor } from "@/components/day-editor";
import { DayBadge } from "@/components/day-status";
import { Button, Card, EmptyState, ErrorNote, LinkButton, PageHeader, Skeleton, useToast, cx, PtOffNotice } from "@/components/ui";
import { useCore, type Core } from "@/lib/data/derived";
import { useSaveAttendanceBatch, type AttendanceInput } from "@/lib/data/hooks";
import { classifyDay } from "@/lib/domain/attendance";
import { formatShort, monthName } from "@/lib/domain/dates";
import type { Attendance, GymStatus, PtStatus } from "@/lib/types";

type Action = { key: string; label: string; short: string; gym: GymStatus | "keep"; pt: PtStatus; icon: typeof Check; tone: string };

const ACTIONS: Action[] = [
  { key: "trained", label: "Went · PT done", short: "PT done", gym: "attended", pt: "completed", icon: CheckCheck, tone: "text-good" },
  { key: "gym", label: "Went · no PT", short: "Gym only", gym: "attended", pt: "not_scheduled", icon: Dumbbell, tone: "text-good" },
  { key: "charged", label: "PT missed · charged", short: "Charged", gym: "keep", pt: "chargeable_absence", icon: X, tone: "text-accent" },
  { key: "free", label: "No PT charge", short: "Not charged", gym: "keep", pt: "not_scheduled", icon: Check, tone: "text-ink-2" },
  { key: "cancelled", label: "Trainer cancelled", short: "Trainer cancelled", gym: "keep", pt: "trainer_cancelled", icon: Ban, tone: "text-info" },
  { key: "self", label: "I cancelled", short: "I cancelled", gym: "keep", pt: "client_cancelled", icon: CalendarX, tone: "text-ink-2" },
];

function toInput(date: string, rec: Attendance | undefined, a: Action): AttendanceInput {
  const gym = a.gym === "keep" ? (rec && rec.gym_status !== "unverified" ? rec.gym_status : "absent") : a.gym;
  return {
    date,
    gym_status: gym,
    pt_status: a.pt,
    absence_reason: rec?.absence_reason ?? null,
    notes: rec?.notes ?? null,
    pt_package_id: null,
  };
}

export default function ReviewPage() {
  const { data: d, loading, error } = useCore();
  if (error) return <ErrorNote error={error} />;
  if (loading || !d) return <Skeleton className="h-96" />;
  if (!d.ptEnabled) return <PtOffNotice />;
  return <Review d={d} />;
}

function Review({ d }: { d: Core }) {
  const toast = useToast();
  const batch = useSaveAttendanceBatch();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [busyDay, setBusyDay] = useState<string | null>(null);
  const days = useMemo(() => [...d.reviewDays].reverse(), [d.reviewDays]);
  const months = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const day of days) m.set(day.slice(0, 7), [...(m.get(day.slice(0, 7)) ?? []), day]);
    return [...m.entries()];
  }, [days]);

  async function apply(dates: string[], a: Action) {
    const rows = [...dates].sort().map((date) => toInput(date, d.byDate.get(date), a));
    try {
      await batch.mutateAsync(rows);
      setSelected(new Set());
      toast.success(`${rows.length} ${rows.length === 1 ? "day" : "days"} marked “${a.label}”.`);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusyDay(null);
    }
  }

  if (days.length === 0) {
    return (
      <div className="anim-rise">
        <PageHeader title="Review days" />
        <Card>
          <EmptyState icon={<PartyPopper className="size-5" />} title="Everything is confirmed" action={<LinkButton href="/calendar">Open calendar</LinkButton>}>
            No past training days are waiting for your confirmation.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const allSelected = selected.size === days.length;

  return (
    <div className="anim-rise pb-24">
      <PageHeader
        title="Review days"
        subtitle={`${days.length} past training ${days.length === 1 ? "day is" : "days are"} unconfirmed. Nothing here counts as attended or missed until you say so.`}
      />

      <Card className="mb-4 p-4 text-sm text-ink-2">
        <p>
          <strong className="text-ink">How this affects your balance:</strong> “PT done” and “PT missed · charged” each use one session. Everything else leaves the balance untouched. You can change any day later from the calendar.
        </p>
      </Card>

      <div className="mb-3 flex items-center justify-between">
        <button
          className="text-sm font-medium text-muted underline-offset-2 hover:text-ink hover:underline"
          onClick={() => setSelected(allSelected ? new Set() : new Set(days))}
        >
          {allSelected ? "Clear selection" : "Select all"}
        </button>
        <span className="text-sm text-muted">{selected.size > 0 ? `${selected.size} selected` : "Tap a day's buttons, or select several"}</span>
      </div>

      <div className="space-y-6">
        {months.map(([m, list]) => (
          <section key={m}>
            <h2 className="mb-2 text-[13px] font-semibold tracking-[0.06em] text-muted uppercase">
              {monthName(`${m}-01`)} {m.slice(0, 4)}
            </h2>
            <Card className="divide-y divide-line">
              {list.map((day) => {
                const rec = d.byDate.get(day);
                const isSel = selected.has(day);
                return (
                  <div key={day} className={cx("flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center", isSel && "bg-surface-2/60")}>
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--ink)]"
                        checked={isSel}
                        onChange={() => {
                          const next = new Set(selected);
                          if (isSel) next.delete(day);
                          else next.add(day);
                          setSelected(next);
                        }}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-ink">{formatShort(day)}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          <DayBadge kind={classifyDay(day, rec, d.dayCtx)} />
                          {rec?.source === "seed" && <span className="text-xs text-muted">from initial setup</span>}
                        </span>
                      </span>
                    </label>
                    <div className="flex flex-wrap gap-1.5 sm:justify-end">
                      {ACTIONS.filter((a) => !(rec?.gym_status === "absent" && a.gym === "attended")).map((a) => (
                        <Button
                          key={a.key}
                          size="sm"
                          loading={busyDay === `${day}:${a.key}`}
                          disabled={batch.isPending}
                          onClick={() => {
                            setBusyDay(`${day}:${a.key}`);
                            apply([day], a);
                          }}
                          icon={<a.icon className={cx("size-3.5", a.tone)} />}
                        >
                          {a.short}
                        </Button>
                      ))}
                      <Button size="sm" variant="ghost" onClick={() => setEditing(day)} aria-label={`Edit ${day}`}>
                        <Pencil className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </Card>
          </section>
        ))}
      </div>

      {selected.size > 0 && (
        <div className="pb-safe fixed inset-x-0 bottom-16 z-40 border-t border-line bg-surface/95 px-4 py-3 shadow-pop backdrop-blur md:bottom-0 md:left-60">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2">
            <span className="mr-2 text-sm font-semibold">Mark {selected.size} as</span>
            {ACTIONS.map((a) => (
              <Button key={a.key} size="sm" loading={batch.isPending && !busyDay} onClick={() => apply([...selected], a)} icon={<a.icon className={cx("size-3.5", a.tone)} />}>
                {a.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {editing && <DayEditor key={editing} d={d} date={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
