"use client";

import { MembershipHeader } from "@/components/membership-nav";
import { Spending } from "@/components/membership-sections";
import { ErrorNote, Skeleton } from "@/components/ui";
import { useCore } from "@/lib/data/derived";

/** Spending: cash actually paid for the gym and PT, by month, with every payment and the rules behind each number. */
export default function SpendingPage() {
  const { data: d, loading, error } = useCore();
  if (error) return <ErrorNote error={error} />;
  if (loading || !d) return <Skeleton className="h-96" />;
  return (
    <div className="anim-rise space-y-8">
      <MembershipHeader title="Spending" subtitle="Cash you actually paid, kept separate from the value of the sessions it bought." />
      <Spending d={d} />
    </div>
  );
}
