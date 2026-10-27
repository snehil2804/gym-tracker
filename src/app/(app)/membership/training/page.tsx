"use client";

import { MembershipHeader } from "@/components/membership-nav";
import { PersonalTraining, PtValue, Trainers } from "@/components/membership-sections";
import { ErrorNote, Skeleton } from "@/components/ui";
import { useCore } from "@/lib/data/derived";

/** Personal training: packages (renew, new, details), trainers, and what the prepaid value turned into. */
export default function TrainingPage() {
  const { data: d, loading, error } = useCore();
  if (error) return <ErrorNote error={error} />;
  if (loading || !d) return <Skeleton className="h-96" />;
  return (
    <div className="anim-rise space-y-8">
      <MembershipHeader title="Personal training" subtitle="Packages, trainers and renewals. Every package keeps its own price and history." />
      <PersonalTraining d={d} />
      {d.ptEnabled && <PtValue d={d} />}
      {d.ptEnabled && <Trainers />}
    </div>
  );
}
