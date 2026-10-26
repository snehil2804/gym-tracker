"use client";

import { ArrowLeft, Copy, Pencil, Trash2, Trophy } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { WorkoutEditor, WORKOUT_TYPES } from "@/components/workout-editor";
import { Badge, Button, Card, ConfirmSheet, EmptyState, ErrorNote, LinkButton, Skeleton, Stat, useToast } from "@/components/ui";
import { useCore, type Core } from "@/lib/data/derived";
import { useDeleteWorkout } from "@/lib/data/hooks";
import { formatDate, weekdayName } from "@/lib/domain/dates";
import { workoutVolume } from "@/lib/domain/stats";
import type { Workout } from "@/lib/types";

export default function WorkoutPage() {
  const { id } = useParams<{ id: string }>();
  const { data: d, loading, error, workoutsLoading } = useCore();
  const [editing, setEditing] = useState(false);
  if (error) return <ErrorNote error={error} />;
  if (loading || workoutsLoading || !d) return <Skeleton className="h-96" />;
  const w = d.workouts.find((x) => x.id === id);
  if (!w)
    return (
      <Card>
        <EmptyState title="Workout not found" action={<LinkButton href="/workouts">All workouts</LinkButton>} />
      </Card>
    );
  if (editing)
    return (
      <div className="anim-rise mx-auto max-w-3xl">
        <button onClick={() => setEditing(false)} className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
          <ArrowLeft className="size-4" /> Back to workout
        </button>
        <h1 className="mt-2 mb-4 font-display text-[28px] font-semibold tracking-tight">Edit workout</h1>
        <WorkoutEditor key={w.updated_at} d={d} initial={w} />
      </div>
    );
  return <WorkoutView d={d} w={w} onEdit={() => setEditing(true)} />;
}

function WorkoutView({ d, w, onEdit }: { d: Core; w: Workout; onEdit: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const del = useDeleteWorkout();
  const [confirm, setConfirm] = useState(false);
  const earlier = d.workouts.filter((x) => x.workout_date < w.workout_date || (x.workout_date === w.workout_date && x.created_at < w.created_at));
  const bestBefore = (exerciseId: string) => {
    let best = 0;
    for (const x of earlier) for (const e of x.exercises) if (e.exercise_id === exerciseId) for (const s of e.sets) if (!s.is_warmup && s.weight_kg) best = Math.max(best, s.weight_kg);
    return best;
  };
  const att = d.byDate.get(w.workout_date);
  const sets = w.exercises.reduce((s, e) => s + e.sets.length, 0);

  return (
    <div className="anim-rise mx-auto max-w-3xl space-y-4">
      <Link href="/workouts" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Workouts
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">
            {weekdayName(w.workout_date, true)}, {formatDate(w.workout_date)}
            {w.start_time ? ` · ${w.start_time.slice(0, 5)}` : ""}
          </p>
          <h1 className="font-display text-[28px] font-semibold tracking-tight">{w.title || w.muscle_groups.join(", ") || "Workout"}</h1>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {w.workout_type && <Badge>{WORKOUT_TYPES.find((t) => t.value === w.workout_type)?.label ?? w.workout_type}</Badge>}
            {w.with_trainer && <Badge tone="good">With trainer</Badge>}
            {att?.pt_status === "completed" && <Badge tone="good">PT session counted</Badge>}
            {w.muscle_groups.map((m) => (
              <Badge key={m} tone="neutral">
                {m}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button icon={<Pencil className="size-4" />} onClick={onEdit}>
            Edit
          </Button>
          <LinkButton href={`/workouts/new?from=${w.id}`} icon={<Copy className="size-4" />}>
            Repeat
          </LinkButton>
          <Button variant="ghost" onClick={() => setConfirm(true)} aria-label="Delete workout">
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <Card className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
        <Stat label="Duration" value={w.duration_min ? `${w.duration_min} min` : "—"} />
        <Stat label="Exercises" value={w.exercises.length} />
        <Stat label="Sets" value={sets} />
        <Stat label="Volume" value={`${workoutVolume(w).toLocaleString("en-IN")} kg`} hint="weight × reps, warm-ups excluded" />
      </Card>

      {w.exercises.length === 0 ? (
        <Card className="p-5 text-sm text-muted">No exercises recorded.</Card>
      ) : (
        <Card className="divide-y divide-line">
          {w.exercises.map((e) => {
            const top = Math.max(0, ...e.sets.filter((s) => !s.is_warmup).map((s) => s.weight_kg ?? 0));
            const prev = bestBefore(e.exercise_id);
            const pr = top > 0 && earlier.length > 0 && top > prev && prev > 0;
            return (
              <div key={e.id} className="px-5 py-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold">{e.exercise?.name}</h3>
                  {pr && (
                    <Badge tone="good" icon={<Trophy className="size-3" />}>
                      New best · {top} kg (was {prev})
                    </Badge>
                  )}
                </div>
                {e.sets.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {e.sets.map((s) => (
                      <span key={s.id ?? s.set_number} className={`num rounded-lg px-2.5 py-1 text-xs font-medium ${s.is_warmup ? "bg-surface-2 text-muted" : "bg-surface-3 text-ink"}`}>
                        {s.reps ?? "–"} × {s.weight_kg ?? "BW"}
                        {s.weight_kg != null ? " kg" : ""}
                        {s.is_warmup ? " (w)" : ""}
                      </span>
                    ))}
                  </div>
                )}
                {(e.notes || e.rest_seconds) && (
                  <p className="mt-1.5 text-xs text-muted">
                    {e.rest_seconds ? `Rest ${e.rest_seconds}s` : ""}
                    {e.notes && e.rest_seconds ? " · " : ""}
                    {e.notes}
                  </p>
                )}
              </div>
            );
          })}
        </Card>
      )}

      {(w.cardio_type || w.cardio_min || w.distance_km) && (
        <Card className="p-5 text-sm">
          <p className="font-semibold">Cardio</p>
          <p className="mt-1 text-ink-2">
            {w.cardio_type || "Cardio"}
            {w.cardio_min ? ` · ${w.cardio_min} min` : ""}
            {w.distance_km ? ` · ${w.distance_km} km` : ""}
          </p>
        </Card>
      )}

      {(w.trainer_notes || w.personal_notes || w.discomfort_notes || w.energy_level) && (
        <Card className="space-y-3 p-5 text-sm">
          {w.energy_level && <p><span className="text-muted">Energy:</span> {w.energy_level}/5</p>}
          {w.trainer_notes && <p><span className="text-muted">Trainer:</span> {w.trainer_notes}</p>}
          {w.personal_notes && <p className="whitespace-pre-wrap"><span className="text-muted">Notes:</span> {w.personal_notes}</p>}
          {w.discomfort_notes && <p className="text-warn"><span className="text-muted">Discomfort:</span> {w.discomfort_notes}</p>}
        </Card>
      )}

      <ConfirmSheet
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Delete this workout?"
        loading={del.isPending}
        onConfirm={async () => {
          try {
            await del.mutateAsync(w.id);
            toast.success("Workout deleted.");
            router.push("/workouts");
          } catch (e) {
            toast.error(e);
          }
        }}
      >
        Its exercises and sets are removed. Attendance and PT sessions for this day are not affected. The deletion is recorded in the audit log.
      </ConfirmSheet>
    </div>
  );
}
