"use client";

import { useState } from "react";
import { MembershipHeader } from "@/components/membership-nav";
import { GymMembership, MembershipEditor } from "@/components/membership-sections";
import { ErrorNote, Skeleton } from "@/components/ui";
import { useCore } from "@/lib/data/derived";

/** Gym membership: current membership, earlier ones, what the gym cost, and editing. */
export default function GymPage() {
  const { data: d, loading, error } = useCore();
  const [adding, setAdding] = useState(false);
  if (error) return <ErrorNote error={error} />;
  if (loading || !d) return <Skeleton className="h-96" />;
  const add = () => {
    setAdding(true);
    setTimeout(() => document.getElementById("edit")?.scrollIntoView({ block: "start" }), 50);
  };
  return (
    <div className="anim-rise space-y-8">
      <MembershipHeader title="Gym membership" subtitle="The estimated end date is calculated; the confirmed one is what your contract says." />
      <GymMembership d={d} onAdd={add} />
      {d.membershipEnabled && <MembershipEditor d={d} adding={adding} setAdding={setAdding} />}
    </div>
  );
}
