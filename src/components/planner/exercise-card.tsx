"use client";

import { ArrowDown, ArrowUp, ChevronDown, Pencil, PlayCircle, RotateCcw, Trash2, VideoOff } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Badge, Button, Input, cx } from "@/components/ui";
import {
  changedFields,
  formatReps,
  formatRest,
  normaliseRir,
  validCustomReps,
  type CatalogExercise,
  type PlanItem,
  type Prescription,
  type RepsUnit,
} from "@/lib/domain/planner";

/**
 * One exercise in a plan. `editable` = custom plan (every field can be changed);
 * otherwise only the custom sets/reps can be set (default plan — the prescription is fixed).
 */
export function ExerciseCard({
  index,
  item,
  exercise,
  editable,
  onChange,
  onCustom,
  onRemove,
  onMove,
  onDemo,
  canMoveUp,
  canMoveDown,
}: {
  index: number;
  item: PlanItem;
  exercise: CatalogExercise | undefined;
  editable: boolean;
  onChange?: (item: PlanItem) => void;
  onCustom?: (custom: PlanItem["custom"]) => void;
  onRemove?: () => void;
  onMove?: (dir: -1 | 1) => void;
  onDemo: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [customising, setCustomising] = useState(false);
  const name = exercise?.name ?? item.name ?? "Exercise";
  const changed = changedFields(item);
  const custom = item.custom;
  const pending = !exercise || exercise.video_status !== "verified";

  return (
    <article className="anim-rise rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <div className="flex items-start gap-3">
        <span className="num grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-sm font-semibold text-ink-2">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-snug text-ink">{name}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {(exercise?.target_muscles ?? []).map((m) => (
              <span key={m} className="rounded-full bg-teal-soft px-2 py-0.5 text-[11px] font-medium text-teal">
                {m}
              </span>
            ))}
            {exercise?.equipment && <span className="text-xs text-muted">· {exercise.equipment}</span>}
            {!exercise && <Badge tone="neutral">Your exercise</Badge>}
          </div>
        </div>
        <Button
          size="sm"
          variant={pending ? "ghost" : "secondary"}
          onClick={onDemo}
          disabled={!exercise}
          icon={pending ? <VideoOff className="size-4" /> : <PlayCircle className="size-4 text-teal" />}
          aria-label={`Demo: ${name}`}
        >
          {pending ? "Demo pending" : "Demo"}
        </Button>
      </div>

      {/* Prescription */}
      {!editable ? (
        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="Sets" value={String(item.sets)} custom={custom?.sets !== undefined ? String(custom.sets) : undefined} />
          <Metric label="Reps" value={formatReps(item.repsMin, item.repsMax, item.repsUnit)} custom={custom?.reps} />
          <Metric label="RIR" value={item.rir} />
          <Metric label="Rest" value={formatRest(item.restMin, item.restMax)} />
        </dl>
      ) : (
        <EditFields item={item} changed={changed} onChange={onChange!} />
      )}

      {item.notes && <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-ink-2">{item.notes}</p>}

      {/* Custom sets/reps (kept apart from the prescription) */}
      {(customising || (editable && (custom?.sets !== undefined || custom?.reps !== undefined))) && (
        <CustomEditor
          custom={custom}
          onSave={(c) => {
            if (onCustom) onCustom(c);
            else onChange?.({ ...item, custom: c });
            setCustomising(false);
          }}
          onCancel={() => setCustomising(false)}
          inline={editable}
        />
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink" aria-expanded={open}>
          <ChevronDown className={cx("size-4 transition-transform", open && "rotate-180")} /> How to
        </button>
        {!customising && !(editable && (custom?.sets !== undefined || custom?.reps !== undefined)) && (
          <button type="button" onClick={() => setCustomising(true)} className="inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink">
            <Pencil className="size-3.5" /> {custom ? "Edit my sets/reps" : "Set my own sets/reps"}
          </button>
        )}
        {!editable && custom && (
          <button type="button" onClick={() => onCustom?.(null)} className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
            <RotateCcw className="size-3.5" /> Back to prescribed
          </button>
        )}
        {editable && (
          <span className="ml-auto flex items-center gap-1">
            <IconBtn label="Move up" disabled={!canMoveUp} onClick={() => onMove?.(-1)}>
              <ArrowUp className="size-4" />
            </IconBtn>
            <IconBtn label="Move down" disabled={!canMoveDown} onClick={() => onMove?.(1)}>
              <ArrowDown className="size-4" />
            </IconBtn>
            <IconBtn label="Remove exercise" onClick={onRemove} danger>
              <Trash2 className="size-4" />
            </IconBtn>
          </span>
        )}
      </div>
      {open && <p className="mt-2 text-sm leading-relaxed text-ink-2">{exercise?.instructions ?? "Your own exercise — add cues in its notes."}</p>}
    </article>
  );
}

function Metric({ label, value, custom }: { label: string; value: string; custom?: string }) {
  return (
    <div className={cx("rounded-xl px-3 py-2", custom ? "bg-gold-soft" : "bg-surface-2")}>
      <dt className="flex items-center gap-1.5 text-[11px] font-medium text-muted">
        {label} {custom && <span className="rounded bg-gold px-1 text-[9px] font-bold tracking-wide text-white uppercase">custom</span>}
      </dt>
      <dd className="num font-semibold text-ink">{custom ?? value}</dd>
      {custom && <dd className="num text-[11px] text-muted">prescribed {value}</dd>}
    </div>
  );
}

function IconBtn({ label, onClick, disabled, danger, children }: { label: string; onClick?: () => void; disabled?: boolean; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cx("grid size-9 place-items-center rounded-lg border border-line text-ink-2 hover:bg-surface-2 disabled:opacity-35", danger && "hover:border-accent/40 hover:text-accent")}
    >
      {children}
    </button>
  );
}

function CustomEditor({ custom, onSave, onCancel, inline }: { custom: PlanItem["custom"]; onSave: (c: PlanItem["custom"]) => void; onCancel: () => void; inline: boolean }) {
  const [sets, setSets] = useState(custom?.sets !== undefined ? String(custom.sets) : "");
  const [reps, setReps] = useState(custom?.reps ?? "");
  const setsOk = sets === "" || (Number(sets) >= 1 && Number(sets) <= 10 && Number.isInteger(Number(sets)));
  const repsOk = reps === "" || validCustomReps(reps);
  const build = (): PlanItem["custom"] => {
    const c: { sets?: number; reps?: string } = {};
    if (sets !== "") c.sets = Number(sets);
    if (reps.trim()) c.reps = reps.trim().replace(/\s*-\s*/, "–");
    return Object.keys(c).length ? c : null;
  };
  return (
    <div className="mt-3 rounded-xl border border-gold/40 bg-gold-soft/60 p-3">
      <p className="text-xs font-semibold text-gold">My sets & reps — the prescription stays as it is</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-xs text-muted">
          Sets
          <Input className="mt-1 h-10" inputMode="numeric" placeholder="as prescribed" value={sets} onChange={(e) => setSets(e.target.value.replace(/\D/g, "").slice(0, 2))} aria-invalid={!setsOk} />
        </label>
        <label className="text-xs text-muted">
          Reps
          <Input className="mt-1 h-10" placeholder="e.g. 10 or 8–10" value={reps} onChange={(e) => setReps(e.target.value.slice(0, 40))} aria-invalid={!repsOk} />
        </label>
      </div>
      {(!setsOk || !repsOk) && <p className="mt-1 text-xs text-accent">{!setsOk ? "Sets must be 1–10." : "Reps look wrong — try 10 or 8–10."}</p>}
      <div className="mt-2 flex justify-end gap-2">
        {!inline && (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        {inline && (
          <Button size="sm" variant="ghost" onClick={() => onSave(null)}>
            Clear
          </Button>
        )}
        <Button size="sm" variant="primary" disabled={!setsOk || !repsOk} onClick={() => onSave(build())}>
          {inline ? "Apply" : "Save"}
        </Button>
      </div>
    </div>
  );
}

/** Editable prescription (custom plans). Fields changed from the default are tinted. */
function EditFields({ item, changed, onChange }: { item: PlanItem; changed: (keyof Prescription)[]; onChange: (i: PlanItem) => void }) {
  const set = (patch: Partial<PlanItem>) => onChange({ ...item, ...patch });
  const num = (v: string, max: number) => Math.min(Math.max(Number(v.replace(/\D/g, "")) || 0, 0), max);
  const F = ({ k, label, children }: { k: keyof Prescription | (keyof Prescription)[]; label: string; children: ReactNode }) => {
    const ks = Array.isArray(k) ? k : [k];
    const was = ks.some((x) => changed.includes(x));
    const base = item.base;
    return (
      <label className={cx("block rounded-xl p-2", was ? "bg-gold-soft" : "bg-surface-2")}>
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted">
          {label} {was && <span className="rounded bg-gold px-1 text-[9px] font-bold tracking-wide text-white uppercase">edited</span>}
        </span>
        {children}
        {was && base && (
          <span className="num block text-[11px] text-muted">
            default{" "}
            {ks[0] === "sets"
              ? base.sets
              : ks[0] === "repsMin"
                ? formatReps(base.repsMin, base.repsMax, base.repsUnit)
                : ks[0] === "rir"
                  ? base.rir
                  : formatRest(base.restMin, base.restMax)}
          </span>
        )}
      </label>
    );
  };
  const small = "mt-1 h-9 w-full rounded-lg border border-line bg-surface px-2 text-sm num";
  return (
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {F({
        k: "sets",
        label: "Sets",
        children: <input className={small} inputMode="numeric" value={item.sets || ""} onChange={(e) => set({ sets: num(e.target.value, 10) })} aria-label="Sets" />,
      })}
      {F({
        k: ["repsMin", "repsMax", "repsUnit"],
        label: "Reps",
        children: (
          <span className="mt-1 flex items-center gap-1">
            <input className={cx(small, "mt-0 w-12")} inputMode="numeric" value={item.repsMin || ""} onChange={(e) => set({ repsMin: num(e.target.value, 100) })} aria-label="Minimum reps" />
            <span className="text-muted">–</span>
            <input className={cx(small, "mt-0 w-12")} inputMode="numeric" value={item.repsMax || ""} onChange={(e) => set({ repsMax: num(e.target.value, 100) })} aria-label="Maximum reps" />
            <select className={cx(small, "mt-0 w-auto min-w-14 flex-1 px-1 text-xs")} value={item.repsUnit} onChange={(e) => set({ repsUnit: e.target.value as RepsUnit })} aria-label="Per">
              <option value="">reps</option>
              <option value="/leg">/leg</option>
              <option value="/arm">/arm</option>
              <option value="/side">/side</option>
            </select>
          </span>
        ),
      })}
      {F({
        k: "rir",
        label: "RIR",
        children: <input className={small} value={item.rir} onChange={(e) => set({ rir: normaliseRir(e.target.value).slice(0, 3) })} aria-label="Reps in reserve" placeholder="1–2" />,
      })}
      {F({
        k: ["restMin", "restMax"],
        label: "Rest (s)",
        children: (
          <span className="mt-1 flex items-center gap-1">
            <input className={cx(small, "mt-0")} inputMode="numeric" value={item.restMin || ""} onChange={(e) => set({ restMin: num(e.target.value, 600) })} aria-label="Minimum rest in seconds" />
            <span className="text-muted">–</span>
            <input className={cx(small, "mt-0")} inputMode="numeric" value={item.restMax || ""} onChange={(e) => set({ restMax: num(e.target.value, 600) })} aria-label="Maximum rest in seconds" />
          </span>
        ),
      })}
    </div>
  );
}
