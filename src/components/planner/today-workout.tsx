"use client";

import { Check, ChevronRight, Dumbbell, Minus, Moon, PartyPopper, Pencil, PlayCircle, Plus, SkipForward, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { DemoModal, ShortPlayer, demoFromCatalog, demoFromExercise, type Demo } from "@/components/planner/demo-modal";
import { usePlanDay } from "@/components/planner/use-plan-day";
import { Badge, Button, Card, ErrorNote, ProgressBar, Skeleton, cx, useToast } from "@/components/ui";
import type { Core } from "@/lib/data/derived";
import { useExercises, useSaveAttendance, useSaveWorkout, type WorkoutPayload } from "@/lib/data/hooks";
import { getSupabase } from "@/lib/supabase/client";
import { isoWeekday } from "@/lib/domain/dates";
import { groupOf } from "@/lib/domain/muscles";
import { WEEKDAYS, formatReps, formatRest, type CatalogExercise, type PlanItem } from "@/lib/domain/planner";
import { PLAN_WORKOUT_TYPE, SKIPPED, cleanSets, itemStatuses, lastSets, sessionWorkout, volume, type LoggedSet } from "@/lib/domain/session";
import type { Exercise } from "@/lib/types";

/**
 * Today's planned workout on the dashboard, logged one exercise at a time:
 * "Did you complete <exercise>?" → enter weight × reps per set → next. Saved as a normal workout
 * (type 'plan'), so History, Progress and PRs pick it up; the first save also marks today as a gym day.
 */
export function TodayWorkout({ d }: { d: Core }) {
  const plan = usePlanDay(d.today);
  const exercises = useExercises();
  if (plan.error || exercises.error) return <ErrorNote error={plan.error || exercises.error} />;
  if (plan.loading || exercises.isLoading || !plan.data || !exercises.data) return <Skeleton className="h-56" />;
  const { day } = plan.data;
  if (!day || day.rest || day.items.length === 0) return <RestDay title={day?.title} focus={day?.focus} planName={plan.data.planName} today={d.today} />;
  return <Logger d={d} items={day.items} title={day.title} focus={day.focus ?? null} planName={plan.data.planName} catalog={plan.data.catalogMap} library={exercises.data} />;
}

function RestDay({ title, focus, planName, today }: { title?: string; focus?: string | null; planName: string; today: string }) {
  return (
    <Card glow="teal" className="flex flex-wrap items-center gap-4 p-5">
      <span className="grid size-12 place-items-center rounded-2xl bg-teal-soft text-teal">
        <Moon className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold tracking-[0.08em] text-teal uppercase">Today&apos;s workout · {WEEKDAYS[isoWeekday(today) - 1]}</p>
        <p className="font-display text-lg font-semibold">{title && title !== "Rest day" ? title : "Rest from lifting"}</p>
        <p className="text-sm text-muted">{focus ?? `No lifting on ${planName} today — steps, cardio if it's scheduled, and the posture routine.`}</p>
      </div>
      <Link href="/workouts" className="inline-flex items-center gap-1 text-sm font-semibold text-teal hover:underline">
        Today&apos;s activity <ChevronRight className="size-4" />
      </Link>
    </Card>
  );
}

function Logger({
  d,
  items,
  title,
  focus,
  planName,
  catalog,
  library,
}: {
  d: Core;
  items: PlanItem[];
  title: string;
  focus: string | null;
  planName: string;
  catalog: Map<string, CatalogExercise>;
  library: Exercise[];
}) {
  const toast = useToast();
  const saveWorkout = useSaveWorkout();
  const saveAttendance = useSaveAttendance();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null); // item key re-opened for editing
  const [demo, setDemo] = useState<Demo | null>(null);

  const nameOf = (i: PlanItem) => (i.exerciseId && catalog.get(i.exerciseId)?.name) || i.name || "Exercise";
  // A plan exercise maps to the user's library exercise linked to it (or with the same name).
  const libraryFor = (i: PlanItem): Exercise | undefined => {
    const n = nameOf(i).toLowerCase().trim();
    return library.find((e) => (i.exerciseId && e.catalog_id === i.exerciseId) || e.name.toLowerCase().trim() === n);
  };
  const session = sessionWorkout(d.workouts, d.today);
  const statuses = itemStatuses(items, (i) => libraryFor(i)?.id ?? null, session);
  const currentIdx = editing ? items.findIndex((i) => i.key === editing) : statuses.findIndex((s) => s === "pending");
  const current = currentIdx >= 0 ? items[currentIdx] : null;
  const doneCount = statuses.filter((s) => s !== "pending").length;
  const allDone = currentIdx < 0;

  const demoFor = (i: PlanItem): Demo => {
    const cat = i.exerciseId ? catalog.get(i.exerciseId) : undefined;
    if (cat) return demoFromCatalog(cat);
    const lib = libraryFor(i);
    return lib ? demoFromExercise(lib) : { title: nameOf(i), videoId: null };
  };

  /** Make sure the plan exercise exists in the user's library (the demo is attached by the database). */
  async function ensureExercise(i: PlanItem): Promise<string> {
    const existing = libraryFor(i);
    if (existing) return existing.id;
    const cat = i.exerciseId ? catalog.get(i.exerciseId) : undefined;
    const { data, error } = await getSupabase()
      .from("exercises")
      .insert({ name: nameOf(i).slice(0, 80), primary_muscle: cat?.primary_muscle ?? "other", category: "strength", catalog_id: cat?.id ?? null })
      .select("id")
      .single();
    if (error) throw error;
    return (data as { id: string }).id;
  }

  /** Saves the whole session with `item` set to `sets` (or skipped when sets is null). */
  async function record(item: PlanItem, sets: { weight_kg: number | null; reps: number }[] | null) {
    setBusy(true);
    try {
      const exId = await ensureExercise(item);
      const ids = new Map<string, string>();
      for (const i of items) {
        const lib = i.key === item.key ? { id: exId } : libraryFor(i);
        if (lib) ids.set(i.key, lib.id);
      }
      const prior = session?.exercises ?? [];
      const planIds = new Set(ids.values());
      const payload: WorkoutPayload = {
        id: session?.id,
        workout_date: d.today,
        title: session?.title ?? title,
        workout_type: PLAN_WORKOUT_TYPE,
        muscle_groups: [...new Set(items.map((i) => (i.exerciseId && catalog.get(i.exerciseId)?.primary_muscle) || "other").map(groupOf))],
        with_trainer: session?.with_trainer ?? false,
        personal_notes: session?.personal_notes ?? `${planName} · ${title}`,
        exercises: [
          ...items.flatMap((i): WorkoutPayload["exercises"] => {
            const id = ids.get(i.key);
            if (!id) return [];
            if (i.key === item.key) {
              return [{ exercise_id: id, name: nameOf(i), rest_seconds: i.restMax, notes: sets ? null : SKIPPED, sets: (sets ?? []).map((s) => ({ ...s, is_warmup: false })) }];
            }
            const row = prior.find((p) => p.exercise_id === id);
            if (!row) return [];
            return [{ exercise_id: id, name: nameOf(i), rest_seconds: row.rest_seconds, notes: row.notes, sets: row.sets.map((s) => ({ reps: s.reps, weight_kg: s.weight_kg, duration_sec: s.duration_sec, is_warmup: s.is_warmup })) }];
          }),
          // keep anything else logged in this session (added from History)
          ...prior
            .filter((p) => !planIds.has(p.exercise_id))
            .map((p) => ({ exercise_id: p.exercise_id, name: p.exercise?.name ?? "Exercise", rest_seconds: p.rest_seconds, notes: p.notes, sets: p.sets.map((s) => ({ reps: s.reps, weight_kg: s.weight_kg, duration_sec: s.duration_sec, is_warmup: s.is_warmup })) })),
        ],
      };
      await saveWorkout.mutateAsync(payload);
      // Logging a lift means you were at the gym today.
      if (sets && d.todayRec?.gym_status !== "attended") {
        await saveAttendance.mutateAsync({
          date: d.today,
          gym_status: "attended",
          pt_status: d.todayRec?.pt_status ?? (d.todayScheduled ? "unverified" : "not_scheduled"),
          pt_package_id: d.todayRec?.pt_package_id ?? null,
          source: "workout",
        });
      }
      setEditing(null);
      toast.success(sets ? `${nameOf(item)} logged — ${sets.length} ${sets.length === 1 ? "set" : "sets"}.` : `${nameOf(item)} skipped.`);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  const totalSets = session?.exercises.reduce((n, e) => n + e.sets.filter((s) => !s.is_warmup).length, 0) ?? 0;
  const totalVolume = session ? session.exercises.reduce((v, e) => v + volume(e.sets.filter((s) => !s.is_warmup)), 0) : 0;

  return (
    <Card glow="good" className="overflow-hidden" as="section">
      <div id="today-workout" className="scroll-mt-20 px-5 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-good uppercase">Today&apos;s workout · {planName}</p>
            <h2 className="font-display text-2xl font-semibold tracking-tight">{title}</h2>
            <p className="text-sm text-muted">{[focus, `${items.length} exercises`].filter(Boolean).join(" · ")}</p>
          </div>
          <Badge tone={allDone ? "good" : "neutral"} icon={allDone ? <Check className="size-3" /> : <Dumbbell className="size-3" />}>
            {doneCount}/{items.length} done
          </Badge>
        </div>
        <ProgressBar
          className="mt-3"
          total={items.length}
          segments={[
            { value: statuses.filter((s) => s === "done").length, className: "bg-good", label: "Done" },
            { value: statuses.filter((s) => s === "skipped").length, className: "bg-line-strong", label: "Skipped" },
          ]}
        />
      </div>

      {current ? (
        <LogStep
          key={current.key + (editing ?? "")}
          item={current}
          index={currentIdx}
          total={items.length}
          name={nameOf(current)}
          demo={demoFor(current)}
          catalog={current.exerciseId ? catalog.get(current.exerciseId) : undefined}
          previous={(() => {
            const lib = libraryFor(current);
            return lib ? lastSets(d.workouts, lib.id, d.today) : [];
          })()}
          existing={(() => {
            const lib = libraryFor(current);
            return lib ? session?.exercises.find((e) => e.exercise_id === lib.id)?.sets.filter((s) => !s.is_warmup) ?? [] : [];
          })()}
          first={doneCount === 0 && !editing}
          busy={busy}
          editing={!!editing}
          onCancelEdit={() => setEditing(null)}
          onSave={(sets) => record(current, sets)}
          onSkip={() => record(current, null)}
        />
      ) : (
        <div className="mx-5 mt-4 flex items-center gap-3 rounded-2xl bg-good-soft p-4">
          <PartyPopper className="size-6 shrink-0 text-good" />
          <div>
            <p className="font-semibold text-good">Workout complete</p>
            <p className="text-sm text-ink-2">
              {totalSets} working sets{totalVolume ? ` · ${Math.round(totalVolume).toLocaleString("en-IN")} kg moved` : ""}. It&apos;s in your history and progress charts.
            </p>
          </div>
        </div>
      )}

      {/* All exercises */}
      <ol className="mt-4 divide-y divide-line border-t border-line">
        {items.map((i, n) => {
          const st = statuses[n];
          const isCurrent = n === currentIdx;
          return (
            <li key={i.key} className={cx("flex items-center gap-3 px-5 py-2.5", isCurrent && "bg-good-soft/40")}>
              <span
                className={cx(
                  "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold",
                  st === "done" ? "bg-good text-white" : st === "skipped" ? "bg-surface-3 text-muted" : isCurrent ? "bg-primary text-primary-ink" : "bg-surface-2 text-ink-2",
                )}
              >
                {st === "done" ? <Check className="size-4" /> : st === "skipped" ? <X className="size-3.5" /> : n + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cx("block truncate text-sm font-medium", st === "skipped" && "text-muted line-through")}>{nameOf(i)}</span>
                <span className="block text-xs text-muted">
                  {i.custom?.sets ?? i.sets} × {i.custom?.reps ?? formatReps(i.repsMin, i.repsMax, i.repsUnit)} · RIR {i.rir}
                </span>
              </span>
              <button type="button" onClick={() => setDemo(demoFor(i))} className="grid size-9 place-items-center rounded-lg text-teal hover:bg-teal-soft" aria-label={`Demo: ${nameOf(i)}`}>
                <PlayCircle className="size-5" />
              </button>
              {st !== "pending" && !isCurrent && (
                <button type="button" onClick={() => setEditing(i.key)} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2" aria-label={`Edit ${nameOf(i)}`}>
                  <Pencil className="size-4" />
                </button>
              )}
            </li>
          );
        })}
      </ol>
      <DemoModal demo={demo} onClose={() => setDemo(null)} />
    </Card>
  );
}

function LogStep({
  item,
  index,
  total,
  name,
  demo,
  catalog,
  previous,
  existing,
  first,
  busy,
  editing,
  onCancelEdit,
  onSave,
  onSkip,
}: {
  item: PlanItem;
  index: number;
  total: number;
  name: string;
  demo: Demo;
  catalog: CatalogExercise | undefined;
  previous: { weight: number | null; reps: number | null }[];
  existing: { weight_kg: number | null; reps: number | null }[];
  first: boolean;
  busy: boolean;
  editing: boolean;
  onCancelEdit: () => void;
  onSave: (sets: { weight_kg: number | null; reps: number }[]) => void;
  onSkip: () => void;
}) {
  const toast = useToast();
  const target = item.custom?.sets ?? item.sets;
  const [open, setOpen] = useState(editing);
  const [sets, setSets] = useState<LoggedSet[]>(() =>
    existing.length
      ? existing.map((s) => ({ weight: s.weight_kg == null ? "" : String(s.weight_kg), reps: s.reps == null ? "" : String(s.reps) }))
      : Array.from({ length: target }, () => ({ weight: "", reps: "" })),
  );
  const prevLine = useMemo(() => previous.map((p) => `${p.weight ?? "—"}×${p.reps ?? "—"}`).join(", "), [previous]);
  const set = (n: number, patch: Partial<LoggedSet>) => setSets((all) => all.map((s, i) => (i === n ? { ...s, ...patch } : s)));
  const save = () => {
    const r = cleanSets(sets);
    if ("error" in r) return toast.error(r.error);
    onSave(r.sets);
  };

  return (
    <div className="grid gap-4 px-5 pt-4 sm:grid-cols-[180px_1fr]">
      <ShortPlayer demo={demo} className="mx-auto max-w-[180px] sm:mx-0" />
      <div className="min-w-0">
        <p className="text-xs font-semibold text-muted">
          Exercise {index + 1} of {total}
          {first && " · let's log today's training"}
        </p>
        <h3 className="mt-0.5 text-lg leading-snug font-semibold">{open ? name : `Did you complete ${name}?`}</h3>
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          <span className="rounded-full bg-surface-2 px-2 py-1">
            <strong>{target}</strong> sets
          </span>
          <span className="rounded-full bg-surface-2 px-2 py-1">
            <strong>{item.custom?.reps ?? formatReps(item.repsMin, item.repsMax, item.repsUnit)}</strong> reps
          </span>
          <span className="rounded-full bg-surface-2 px-2 py-1">
            RIR <strong>{item.rir}</strong>
          </span>
          <span className="rounded-full bg-surface-2 px-2 py-1">
            rest <strong>{formatRest(item.restMin, item.restMax)}</strong>
          </span>
          {catalog?.target_muscles.slice(0, 2).map((m) => (
            <span key={m} className="rounded-full bg-teal-soft px-2 py-1 font-medium text-teal">
              {m}
            </span>
          ))}
        </div>
        {item.notes && <p className="mt-2 text-sm text-ink-2">{item.notes}</p>}

        {!open ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" icon={<Check className="size-4" />} onClick={() => setOpen(true)} disabled={busy}>
              Yes — log weight & reps
            </Button>
            <Button variant="ghost" icon={<SkipForward className="size-4" />} onClick={onSkip} loading={busy}>
              Skip today
            </Button>
          </div>
        ) : (
          <div className="mt-4">
            {prevLine && <p className="mb-2 text-xs text-muted">Last time: {prevLine} (kg × reps)</p>}
            <div className="space-y-2">
              {sets.map((s, n) => (
                <div key={n} className="flex items-center gap-2">
                  <span className="num w-12 shrink-0 text-xs font-semibold text-muted">Set {n + 1}</span>
                  <label className="flex min-w-0 flex-1 items-center gap-1 rounded-xl border border-line bg-surface px-3 focus-within:border-ink">
                    <input
                      className="num h-11 w-full min-w-0 bg-transparent text-sm outline-none"
                      inputMode="decimal"
                      placeholder={previous[n]?.weight != null ? String(previous[n].weight) : "kg"}
                      value={s.weight}
                      onChange={(e) => set(n, { weight: e.target.value.replace(/[^\d.,]/g, "").slice(0, 7) })}
                      aria-label={`Set ${n + 1} weight in kg`}
                    />
                    <span className="text-xs text-muted">kg</span>
                  </label>
                  <span className="text-muted">×</span>
                  <label className="flex min-w-0 flex-1 items-center gap-1 rounded-xl border border-line bg-surface px-3 focus-within:border-ink">
                    <input
                      className="num h-11 w-full min-w-0 bg-transparent text-sm outline-none"
                      inputMode="numeric"
                      placeholder={previous[n]?.reps != null ? String(previous[n].reps) : "reps"}
                      value={s.reps}
                      onChange={(e) => set(n, { reps: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                      aria-label={`Set ${n + 1} reps`}
                    />
                    <span className="text-xs text-muted">reps</span>
                  </label>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => setSets((a) => [...a, { weight: a.at(-1)?.weight ?? "", reps: "" }])} disabled={sets.length >= 12}>
                Add set
              </Button>
              <Button size="sm" variant="ghost" icon={<Minus className="size-4" />} onClick={() => setSets((a) => a.slice(0, -1))} disabled={sets.length <= 1}>
                Remove set
              </Button>
            </div>
            <p className="mt-1 text-[11px] text-muted">Only working sets — warm-up and ramp-up sets don&apos;t go here.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="primary" onClick={save} loading={busy}>
                {editing ? "Save changes" : index + 1 < total ? "Save & next" : "Save & finish"}
              </Button>
              {editing ? (
                <Button variant="ghost" onClick={onCancelEdit}>
                  Cancel
                </Button>
              ) : (
                <Button variant="ghost" icon={<SkipForward className="size-4" />} onClick={onSkip} disabled={busy}>
                  Skip
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
