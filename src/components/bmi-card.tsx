"use client";

import { Scale } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button, Card, Input, Skeleton, cx, useToast } from "@/components/ui";
import { useGoals, useMeasurements, useSaveGoal, useSaveMeasurement } from "@/lib/data/hooks";
import { BMI_LABEL, BMI_MIDPOINT, bmi, classify, healthyRange, midpointTarget, type BmiClass } from "@/lib/domain/bmi";

const TONE: Record<BmiClass, { text: string; pill: string }> = {
  underweight: { text: "text-info", pill: "bg-info-soft text-info" },
  normal: { text: "text-good", pill: "bg-good-soft text-good" },
  overweight: { text: "text-warn", pill: "bg-warn-soft text-warn" },
  obesity: { text: "text-accent", pill: "bg-accent-soft text-accent" },
};

/**
 * BMI from your height and latest weight, with a quick weight log and a target weight you can nudge.
 * The default target is the middle of the healthy band (BMI 21.75); a saved target is a Body-weight goal.
 */
export function BmiCard({ heightCm, today }: { heightCm: number | null; today: string }) {
  const toast = useToast();
  const measurements = useMeasurements();
  const goals = useGoals();
  const saveGoal = useSaveGoal();
  const saveWeight = useSaveMeasurement();
  const [target, setTarget] = useState<number | null>(null);
  const [weightInput, setWeightInput] = useState("");

  if (measurements.isLoading || goals.isLoading) return <Skeleton className="h-56 lg:col-span-2" />;
  const latest = (measurements.data ?? []).filter((m) => m.metric === "Body weight").at(-1);
  const weightKg = latest?.value ?? null;
  const goal = (goals.data ?? []).find((g) => g.is_active && g.kind === "measurement" && g.metric === "Body weight");

  const logWeight = async () => {
    const w = Number(weightInput.replace(",", "."));
    if (!(w > 20 && w < 400)) return toast.error("Enter your weight in kg (20–400).");
    try {
      await saveWeight.mutateAsync({ measured_on: today, metric: "Body weight", value: Math.round(w * 10) / 10, unit: "kg", note: null });
      setWeightInput("");
      toast.success("Weight saved.");
    } catch (e) {
      toast.error(e);
    }
  };
  const weightLogger = (
    <div className="flex items-center gap-2">
      <Input
        className="h-10 w-28"
        inputMode="decimal"
        placeholder={weightKg ? String(weightKg) : "kg"}
        value={weightInput}
        onChange={(e) => setWeightInput(e.target.value.replace(/[^\d.,]/g, "").slice(0, 5))}
        onKeyDown={(e) => e.key === "Enter" && logWeight()}
        aria-label="Today's weight in kg"
      />
      <Button size="sm" className="h-10" onClick={logWeight} loading={saveWeight.isPending} disabled={!weightInput}>
        Log weight
      </Button>
    </div>
  );

  if (!heightCm || !weightKg) {
    return (
      <Card glow="info" className="p-5 lg:col-span-2">
        <p className="text-[11px] font-semibold tracking-[0.08em] text-info uppercase">Body-mass index</p>
        <p className="mt-1 text-sm text-muted">
          {!heightCm ? (
            <>
              Add your height in{" "}
              <Link href="/settings" className="font-medium text-ink underline underline-offset-2">
                Settings
              </Link>{" "}
              and log your weight to see your BMI.
            </>
          ) : (
            "Log today's weight to see your BMI and a healthy target."
          )}
        </p>
        {heightCm && <div className="mt-3">{weightLogger}</div>}
      </Card>
    );
  }

  const value = bmi(weightKg, heightCm)!;
  const cls = classify(value);
  const range = healthyRange(heightCm);
  const t = target ?? (goal?.target_value != null ? Number(goal.target_value) : midpointTarget(heightCm));
  const tBmi = bmi(t, heightCm)!;
  const tCls = classify(tBmi);
  const diff = Math.round((t - weightKg) * 10) / 10;
  const pos = (b: number) => `${Math.min(Math.max(((b - 15) / (40 - 15)) * 100, 0), 100)}%`;
  const step = (delta: number) => setTarget(Math.min(Math.max(Math.round((t + delta) * 2) / 2, 30), 250));
  const saved = goal?.target_value != null && Number(goal.target_value) === t;

  return (
    <Card glow="info" className="p-5 lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.08em] text-info uppercase">
            <Scale className="size-3.5" /> Body-mass index
          </p>
          <p className="mt-1 flex items-baseline gap-3">
            <span className={cx("num font-display text-4xl font-semibold tracking-tight", TONE[cls].text)}>{value.toFixed(1)}</span>
            <span className={cx("rounded-full px-3 py-1 text-sm font-bold", TONE[cls].pill)}>{BMI_LABEL[cls]}</span>
          </p>
          <p className="mt-1 text-xs text-muted">
            {weightKg} kg at {heightCm} cm · healthy for your height: <strong className="text-good">{range.min}–{range.max} kg</strong>
          </p>
        </div>
        {weightLogger}
      </div>

      <div className="relative mt-5 mb-6">
        <div className="flex h-2.5 overflow-hidden rounded-full">
          <span className="bg-info/70" style={{ width: pos(18.5) }} />
          <span className="bg-good" style={{ width: `calc(${pos(25)} - ${pos(18.5)})` }} />
          <span className="bg-warn" style={{ width: `calc(${pos(30)} - ${pos(25)})` }} />
          <span className="flex-1 bg-accent/80" />
        </div>
        <span className="absolute -top-1 size-4.5 -translate-x-1/2 rounded-full border-[3px] border-surface bg-ink shadow" style={{ left: pos(value) }} title={`You: ${value}`} />
        <span className="absolute -top-1 size-4.5 -translate-x-1/2 rounded-full border-[3px] border-surface bg-good shadow ring-2 ring-good/40" style={{ left: pos(tBmi) }} title={`Target: ${tBmi}`} />
        <div className="num relative mt-1.5 h-3 text-[10px] text-muted">
          {[15, 18.5, 25, 30, 40].map((v, i, all) => (
            <span key={v} className={cx("absolute", i === 0 ? "" : i === all.length - 1 ? "-translate-x-full" : "-translate-x-1/2")} style={{ left: pos(v) }}>
              {v}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-surface-2 p-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">Target weight</p>
          <div className="mt-1 flex items-center gap-2">
            <button type="button" onClick={() => step(-0.5)} className="grid size-10 place-items-center rounded-xl border border-line bg-surface text-lg font-semibold hover:bg-surface-3" aria-label="Decrease target by 0.5 kg">
              −
            </button>
            <span className="num min-w-24 text-center font-display text-2xl font-semibold">{t.toFixed(1)} kg</span>
            <button type="button" onClick={() => step(0.5)} className="grid size-10 place-items-center rounded-xl border border-line bg-surface text-lg font-semibold hover:bg-surface-3" aria-label="Increase target by 0.5 kg">
              +
            </button>
          </div>
          <p className="mt-1.5 text-xs text-muted">
            BMI at target <strong className={TONE[tCls].text}>{tBmi.toFixed(1)} · {BMI_LABEL[tCls]}</strong>
            {" · "}
            {diff === 0 ? "that's where you are now" : `${Math.abs(diff)} kg to ${diff < 0 ? "lose" : "gain"}`}
          </p>
          {tCls !== "normal" && <p className="mt-1 text-xs text-warn">Outside the healthy range for your height ({range.min}–{range.max} kg).</p>}
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <Button
            variant="primary"
            disabled={saved}
            loading={saveGoal.isPending}
            onClick={async () => {
              try {
                await saveGoal.mutateAsync({ id: goal?.id, kind: "measurement", metric: "Body weight", title: `Reach ${t} kg`, target_value: t, is_active: true });
                toast.success(`Target weight set to ${t} kg.`);
              } catch (e) {
                toast.error(e);
              }
            }}
          >
            {saved ? "Target saved" : goal ? "Update target" : "Save target"}
          </Button>
          <button type="button" className="text-xs text-muted underline-offset-2 hover:underline" onClick={() => setTarget(midpointTarget(heightCm))}>
            Reset to mid-healthy (BMI {BMI_MIDPOINT})
          </button>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-muted">BMI is a rough screen for adults and doesn&apos;t account for muscle mass — track waist and photos too.</p>
    </Card>
  );
}
