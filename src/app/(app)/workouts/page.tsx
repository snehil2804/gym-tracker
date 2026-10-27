"use client";

import { ChevronRight, Dumbbell, LayoutGrid, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { MUSCLES } from "@/components/workout-editor";
import { Badge, Card, Chip, EmptyState, ErrorNote, Input, LinkButton, PageHeader, Skeleton, Stat } from "@/components/ui";
import { useCore } from "@/lib/data/derived";
import { formatShort, monthName } from "@/lib/domain/dates";
import { monthRange, weekRange, workoutsBetween, workoutVolume } from "@/lib/domain/stats";

export default function WorkoutsPage() {
  const { data: d, loading, error, workoutsLoading } = useCore();
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!d) return [];
    const needle = q.trim().toLowerCase();
    return d.workouts.filter((w) => {
      if (muscle && !w.muscle_groups.includes(muscle) && !w.exercises.some((e) => e.exercise?.primary_muscle === muscle)) return false;
      if (!needle) return true;
      return (
        (w.title ?? "").toLowerCase().includes(needle) ||
        w.exercises.some((e) => e.exercise?.name.toLowerCase().includes(needle)) ||
        (w.personal_notes ?? "").toLowerCase().includes(needle)
      );
    });
  }, [d, q, muscle]);

  if (error) return <ErrorNote error={error} />;
  if (loading || workoutsLoading || !d) return <Skeleton className="h-96" />;

  const wk = weekRange(d.today);
  const mo = monthRange(d.today);
  const groups = new Map<string, typeof filtered>();
  for (const w of filtered) groups.set(w.workout_date.slice(0, 7), [...(groups.get(w.workout_date.slice(0, 7)) ?? []), w]);

  return (
    <div className="anim-rise">
      <PageHeader
        title="Workouts"
        actions={
          <>
            <LinkButton href="/workouts/library" icon={<LayoutGrid className="size-4" />}>
              Exercises & templates
            </LinkButton>
            <LinkButton href="/workouts/new" variant="primary" icon={<Plus className="size-4" />}>
              Log workout
            </LinkButton>
          </>
        }
      />
      <Card className="mb-4 grid grid-cols-3 gap-4 p-5">
        <Stat label="This week" value={workoutsBetween(d.workouts, wk.from, wk.to).length} hint={`goal ${d.profile.weekly_workout_goal}`} />
        <Stat label="This month" value={workoutsBetween(d.workouts, mo.from, mo.to).length} />
        <Stat label="All time" value={d.workouts.length} />
      </Card>

      {d.workouts.length === 0 ? (
        <Card>
          <EmptyState icon={<Dumbbell className="size-5" />} title="Your workout diary is empty" action={<LinkButton href="/workouts/new" variant="primary">Log a workout</LinkButton>}>
            Log what you did — or describe it in a sentence — and your strength and frequency charts will build from real sessions.
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="mb-4 space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
              <Input className="pl-9" placeholder="Search workouts or exercises" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="-mx-1 flex gap-1.5 no-scrollbar overflow-x-auto px-1 pb-1">
              <Chip selected={!muscle} onClick={() => setMuscle(null)}>
                All
              </Chip>
              {MUSCLES.map((m) => (
                <Chip key={m} selected={muscle === m} onClick={() => setMuscle(muscle === m ? null : m)}>
                  {m}
                </Chip>
              ))}
            </div>
          </div>
          {filtered.length === 0 && <p className="py-8 text-center text-sm text-muted">No workouts match.</p>}
          <div className="space-y-6">
            {[...groups.entries()].map(([m, ws]) => (
              <section key={m}>
                <h2 className="mb-2 text-[13px] font-semibold tracking-[0.06em] text-muted uppercase">
                  {monthName(`${m}-01`)} {m.slice(0, 4)} · {ws.length}
                </h2>
                <Card className="divide-y divide-line">
                  {ws.map((w) => (
                    <Link key={w.id} href={`/workouts/${w.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/50 sm:px-5">
                      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface-2">
                        <span className="num text-base font-semibold">{Number(w.workout_date.slice(8))}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-semibold">{w.title || w.muscle_groups.join(", ") || "Workout"}</span>
                          {w.with_trainer && <Badge tone="good">PT</Badge>}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {formatShort(w.workout_date)} · {w.exercises.map((e) => e.exercise?.name).filter(Boolean).slice(0, 4).join(", ") || "no exercises"}
                        </span>
                      </span>
                      <span className="hidden text-right text-xs text-muted sm:block">
                        {w.duration_min ? `${w.duration_min} min` : ""}
                        <br />
                        {workoutVolume(w) ? `${workoutVolume(w).toLocaleString("en-IN")} kg` : ""}
                      </span>
                      <ChevronRight className="size-4 text-faint" />
                    </Link>
                  ))}
                </Card>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
