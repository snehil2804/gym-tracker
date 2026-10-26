"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { WorkoutEditor } from "@/components/workout-editor";
import { ErrorNote, Skeleton } from "@/components/ui";
import { useCore } from "@/lib/data/derived";
import { isISODate } from "@/lib/domain/dates";

export default function NewWorkoutPage() {
  const { data: d, loading, error, workoutsLoading } = useCore();
  const params = useSearchParams();
  if (error) return <ErrorNote error={error} />;
  if (loading || workoutsLoading || !d) return <Skeleton className="h-96" />;
  const date = params.get("date");
  const from = params.get("from");
  const dup = from ? d.workouts.find((w) => w.id === from) : undefined;
  return (
    <div className="anim-rise mx-auto max-w-3xl">
      <Link href="/workouts" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Workouts
      </Link>
      <h1 className="mt-2 mb-4 font-display text-[28px] font-semibold tracking-tight">{dup ? "Repeat workout" : "Log a workout"}</h1>
      <WorkoutEditor d={d} initialDate={date && isISODate(date) && date <= d.today ? date : undefined} duplicateOf={dup} />
    </div>
  );
}
