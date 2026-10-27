"use client";

import { Bike, Check, ChevronDown, Flame, Footprints, HeartPulse, StretchHorizontal } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Input, ProgressBar, Segmented, Select, cx, useToast } from "@/components/ui";
import {
  useActivityRange,
  useDailyActivity,
  useSaveDailyActivity,
  useSavePlannerSettings,
  type DailyActivity,
  type PlannerSettings,
} from "@/lib/data/planner";
import { addDays, startOfWeek } from "@/lib/domain/dates";
import {
  CARDIO,
  MOBILITY,
  MOBILITY_NOTE,
  NEAT_CHECKLIST,
  STEPS,
  WARMUP,
  WEEKDAYS,
  formatReps,
  progress,
  rampExercises,
  type CatalogExercise,
  type PlanDay,
} from "@/lib/domain/planner";

/** Expandable section; stays compact until opened. */
export function Panel({
  icon,
  tone,
  title,
  summary,
  done,
  defaultOpen,
  children,
}: {
  icon: ReactNode;
  tone: string;
  title: string;
  summary: ReactNode;
  done?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-surface-2/50 sm:px-5">
        <span className={cx("grid size-10 shrink-0 place-items-center rounded-xl", tone)}>{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 font-semibold text-ink">
            {title}
            {done && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-good-soft px-1.5 py-0.5 text-[10px] font-bold text-good">
                <Check className="size-3" /> done
              </span>
            )}
          </span>
          <span className="block truncate text-xs text-muted">{summary}</span>
        </span>
        <ChevronDown className={cx("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="border-t border-line px-4 py-4 sm:px-5">{children}</div>}
    </section>
  );
}

function CheckRow({ checked, onToggle, label, hint, right }: { checked: boolean; onToggle: () => void; label: ReactNode; hint?: ReactNode; right?: ReactNode }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} onClick={onToggle} className="flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-2">
      <span className={cx("mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition-colors", checked ? "border-good bg-good text-white" : "border-line-strong bg-surface")}>
        {checked && <Check className="size-3.5" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx("block text-sm font-medium", checked ? "text-muted line-through decoration-1" : "text-ink")}>{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      {right && <span className="shrink-0 text-xs font-semibold text-ink-2">{right}</span>}
    </button>
  );
}

function useToggleList(date: string, field: "warmup" | "mobility" | "neat") {
  const { data } = useDailyActivity(date);
  const save = useSaveDailyActivity(date);
  const toast = useToast();
  const done = (data?.[field] as { done?: string[] } | undefined)?.done ?? [];
  const toggle = (id: string) =>
    save.mutate(
      (cur) => {
        const list = (cur[field] as { done?: string[] }).done ?? [];
        return { [field]: { ...cur[field], done: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] } } as Partial<DailyActivity>;
      },
      { onError: (e) => toast.error(e) },
    );
  return { done, toggle };
}

// ---------------------------------------------------------------------------
// Section G — warm-up
// ---------------------------------------------------------------------------
export function WarmupPanel({ date, day, catalog }: { date: string; day: PlanDay; catalog: Map<string, CatalogExercise> }) {
  const { done, toggle } = useToggleList(date, "warmup");
  const ramps = rampExercises(day);
  const all = [WARMUP.general, ...WARMUP.dynamic, ...ramps.flatMap((i) => WARMUP.ramp.map((r) => ({ id: `ramp:${i.key}:${r.pct}` })))];
  const p = progress(done, all);
  return (
    <Panel
      icon={<Flame className="size-5" />}
      tone="bg-warn-soft text-warn"
      title="Warm-up · 8–10 min"
      summary={`${Math.round(p * 100)}% · general, dynamic moves and ramp-up sets`}
      done={p === 1}
    >
      <ProgressBar total={1} segments={[{ value: p, className: "bg-warn", label: "Warm-up done" }]} />
      <p className="mt-4 text-xs font-semibold tracking-wide text-muted uppercase">1 · General (4–5 min)</p>
      <CheckRow checked={done.includes("general")} onToggle={() => toggle("general")} label="Easy bike or incline walk" />
      <p className="mt-3 text-xs font-semibold tracking-wide text-muted uppercase">2 · Dynamic (3 min)</p>
      {WARMUP.dynamic.map((m) => (
        <CheckRow key={m.id} checked={done.includes(m.id)} onToggle={() => toggle(m.id)} label={m.label} right={m.dose} />
      ))}
      <p className="mt-3 text-xs font-semibold tracking-wide text-muted uppercase">3 · Ramp-up for the first 1–2 exercises</p>
      <p className="mb-1 px-2 text-xs text-muted">{WARMUP.rampNote}</p>
      {ramps.map((i) => (
        <div key={i.key} className="mt-2 rounded-xl bg-surface-2/60 p-2">
          <p className="px-2 text-sm font-semibold">{(i.exerciseId && catalog.get(i.exerciseId)?.name) || i.name}</p>
          <p className="px-2 text-[11px] text-muted">
            then {i.custom?.sets ?? i.sets} working sets × {i.custom?.reps ?? formatReps(i.repsMin, i.repsMax, i.repsUnit)}
          </p>
          {WARMUP.ramp.map((r) => (
            <CheckRow
              key={r.pct}
              checked={done.includes(`ramp:${i.key}:${r.pct}`)}
              onToggle={() => toggle(`ramp:${i.key}:${r.pct}`)}
              label={`~${r.pct}% of working weight × ${r.reps}`}
              hint="warm-up set — not a working set"
            />
          ))}
        </div>
      ))}
      <p className="mt-3 px-2 text-xs text-muted">Cool-down: {WARMUP.coolDown}</p>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Section E — cardio
// ---------------------------------------------------------------------------
export function CardioPanel({ date, weekday, settings }: { date: string; weekday: number; settings: PlannerSettings }) {
  const { data } = useDailyActivity(date);
  const save = useSaveDailyActivity(date);
  const saveSettings = useSavePlannerSettings();
  const toast = useToast();
  const ws = startOfWeek(date);
  const week = useActivityRange(ws, addDays(ws, 6));
  const doneThisWeek = (week.data ?? []).filter((a) => a.cardio?.done).length;
  const c = data?.cardio ?? {};
  const scheduled = settings.cardio_days.includes(weekday);
  const third = settings.cardio_days.includes(3) ? "3" : "6";
  const patch = (p: Partial<typeof c>) => save.mutate((cur) => ({ cardio: { ...cur.cardio, ...p } }), { onError: (e) => toast.error(e) });
  const minutesOk = c.minutes == null || (c.minutes >= 1 && c.minutes <= 300);

  return (
    <Panel
      icon={<Bike className="size-5" />}
      tone="bg-info-soft text-info"
      title={scheduled ? "Cardio today · Zone 2" : "Cardio · Zone 2"}
      summary={`${doneThisWeek}/${CARDIO.sessionsPerWeek} this week · ${CARDIO.minutes.min}–${CARDIO.minutes.max} min, ~120–140 bpm`}
      done={!!c.done}
      defaultOpen={scheduled && !c.done}
    >
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <Info k="Activity" v={CARDIO.activities.join(" or ")} />
        <Info k="Duration" v={`${CARDIO.minutes.min}–${CARDIO.minutes.max} min`} />
        <Info k="Intensity" v={CARDIO.intensity} />
        <Info k="Timing" v={scheduled ? (weekday === 1 || weekday === 4 ? "After lifting today" : "Today (rest from lifting is fine)") : CARDIO.timing} />
      </dl>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-muted">
          What you did
          <Select className="mt-1" value={c.activity ?? CARDIO.activities[0]} onChange={(e) => patch({ activity: e.target.value })}>
            {CARDIO.activities.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </Select>
        </label>
        <label className="text-xs text-muted">
          Minutes
          <Input
            className="mt-1"
            inputMode="numeric"
            placeholder="20–30"
            value={c.minutes ?? ""}
            onChange={(e) => patch({ minutes: e.target.value === "" ? null : Math.min(Number(e.target.value.replace(/\D/g, "")), 300) })}
            aria-invalid={!minutesOk}
          />
        </label>
        <label className="text-xs text-muted">
          Avg heart rate (optional)
          <Input className="mt-1" inputMode="numeric" placeholder="120–140" value={c.avg_hr ?? ""} onChange={(e) => patch({ avg_hr: e.target.value === "" ? null : Math.min(Number(e.target.value.replace(/\D/g, "")), 230) })} />
        </label>
      </div>
      {c.avg_hr != null && (c.avg_hr < 110 || c.avg_hr > 150) && <p className="mt-1 text-xs text-warn">Zone 2 is about 120–140 bpm for you.</p>}
      <div className="mt-3">
        <CheckRow checked={!!c.done} onToggle={() => patch({ done: !c.done, activity: c.activity ?? CARDIO.activities[0] })} label="Cardio session done" hint="Counts toward this week's 3 sessions" />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-2 p-3">
        <p className="text-sm">
          <span className="font-semibold">Schedule:</span> Mon & Thu after lifting, plus
        </p>
        <Segmented
          size="sm"
          ariaLabel="Third cardio session"
          value={third}
          onChange={(v) => saveSettings.mutate({ cardio_days: v === "3" ? [1, 3, 4] : [1, 4, 6] }, { onError: (e) => toast.error(e) })}
          options={[
            { value: "6", label: "Saturday" },
            { value: "3", label: "Wednesday" },
          ]}
        />
      </div>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted">
        {CARDIO.rules.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </Panel>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2">
      <dt className="text-[11px] font-medium text-muted">{k}</dt>
      <dd className="text-sm text-ink">{v}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section F — steps / NEAT
// ---------------------------------------------------------------------------
export function StepsPanel({ date, settings }: { date: string; settings: PlannerSettings }) {
  const { data } = useDailyActivity(date);
  const save = useSaveDailyActivity(date);
  const saveSettings = useSavePlannerSettings();
  const toast = useToast();
  const { done, toggle } = useToggleList(date, "neat");
  const [draft, setDraft] = useState<string | null>(null);
  const [targetDraft, setTargetDraft] = useState<string | null>(null);
  const steps = data?.steps ?? null;
  const target = settings.step_target;
  const pct = steps ? Math.min(steps / target, 1) : 0;
  const commitSteps = () => {
    if (draft === null) return;
    const n = draft === "" ? null : Number(draft.replace(/\D/g, ""));
    if (n !== null && (n < 0 || n > 200000)) return toast.error("Steps must be between 0 and 200,000.");
    save.mutate({ steps: n }, { onError: (e) => toast.error(e) });
    setDraft(null);
  };
  const commitTarget = () => {
    if (targetDraft === null) return;
    const n = Number(targetDraft.replace(/\D/g, ""));
    if (!(n >= 1000 && n <= 50000)) {
      setTargetDraft(null);
      return toast.error("Step target must be 1,000–50,000.");
    }
    saveSettings.mutate({ step_target: n }, { onError: (e) => toast.error(e) });
    setTargetDraft(null);
  };

  return (
    <Panel
      icon={<Footprints className="size-5" />}
      tone="bg-good-soft text-good"
      title="Steps & movement"
      summary={`${steps?.toLocaleString("en-IN") ?? "—"} / ${target.toLocaleString("en-IN")} steps · ${done.length}/${NEAT_CHECKLIST.length} habits`}
      done={!!steps && steps >= target}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted">
          Steps today
          <Input
            className="mt-1"
            inputMode="numeric"
            placeholder="e.g. 7500"
            value={draft ?? (steps ?? "")}
            onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onBlur={commitSteps}
            onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
          />
        </label>
        <label className="text-xs text-muted">
          Daily target
          <Input
            className="mt-1"
            inputMode="numeric"
            value={targetDraft ?? target}
            onChange={(e) => setTargetDraft(e.target.value.replace(/\D/g, "").slice(0, 5))}
            onBlur={commitTarget}
            onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
          />
        </label>
      </div>
      <ProgressBar className="mt-3" total={1} segments={[{ value: pct, className: "bg-good", label: "Steps" }]} />
      <p className="mt-1 text-xs text-muted">{steps ? (steps >= target ? "Target hit — nice." : `${(target - steps).toLocaleString("en-IN")} to go.`) : "Log your steps from your phone or band."}</p>

      <p className="mt-4 text-xs font-semibold tracking-wide text-muted uppercase">Movement through the workday</p>
      {NEAT_CHECKLIST.map((n) => (
        <CheckRow key={n.id} checked={done.includes(n.id)} onToggle={() => toggle(n.id)} label={n.label} hint={n.hint} />
      ))}
      <details className="mt-3 rounded-xl bg-surface-2 p-3 text-xs text-muted">
        <summary className="cursor-pointer font-semibold text-ink-2">How to build up your steps</summary>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          {STEPS.progression.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </details>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Section H — posture / mobility
// ---------------------------------------------------------------------------
export function MobilityPanel({ date, restDay }: { date: string; restDay: boolean }) {
  const { done, toggle } = useToggleList(date, "mobility");
  const p = progress(done, MOBILITY);
  return (
    <Panel
      icon={<StretchHorizontal className="size-5" />}
      tone="bg-teal-soft text-teal"
      title="Posture & mobility · 10 min"
      summary={`${done.filter((d) => MOBILITY.some((m) => m.id === d)).length}/${MOBILITY.length} drills · ${restDay ? "great on rest days" : "after your session"}`}
      done={p === 1}
    >
      <ProgressBar total={1} segments={[{ value: p, className: "bg-teal", label: "Mobility done" }]} />
      <div className="mt-3">
        {MOBILITY.map((m) => (
          <CheckRow key={m.id} checked={done.includes(m.id)} onToggle={() => toggle(m.id)} label={m.label} hint={m.purpose} right={m.dose} />
        ))}
      </div>
      <p className="mt-3 flex gap-2 rounded-xl bg-surface-2 p-3 text-xs text-muted">
        <HeartPulse className="size-4 shrink-0 text-teal" /> {MOBILITY_NOTE}
      </p>
    </Panel>
  );
}

export { WEEKDAYS };
