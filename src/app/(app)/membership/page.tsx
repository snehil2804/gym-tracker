"use client";

import { ArrowUpRight, Dumbbell, IdCard, Wallet } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { MembershipCard, MissedValueCard, MoneyCard, PackageCard } from "@/components/membership-cards";
import { MembershipHeader } from "@/components/membership-nav";
import { MoneyScope, useMoneyFormatter } from "@/components/preferences";
import { ErrorNote, Skeleton, cx } from "@/components/ui";
import { useCore, type Core } from "@/lib/data/derived";
import { membershipStatus } from "@/lib/domain/reminders";

/**
 * Membership insights: three doors (Personal training, Gym membership, Spending) and the summary
 * cards for each — the package, missed PT value, membership and money cards that used to sit on
 * Today. Details and editing live on the three sub-pages.
 */
export default function MembershipOverview() {
  const { data: d, loading, error } = useCore();
  if (error) return <ErrorNote error={error} />;
  if (loading || !d) return <Skeleton className="h-96" />;
  return <Overview d={d} />;
}

function Overview({ d }: { d: Core }) {
  const fmt = useMoneyFormatter("dash-money");
  const p = d.current;
  const m = d.membership;
  const ms = m ? membershipStatus(m, d.today) : null;
  return (
    <div className="anim-rise space-y-4">
      <MembershipHeader title="Membership insights" subtitle="Your personal training, gym membership and what they cost — at a glance." />

      <div className="grid gap-3 sm:grid-cols-3">
        <Door
          href="/membership/training"
          icon={<Dumbbell className="size-5" />}
          tone="gold"
          title="Personal training"
          value={!d.ptEnabled ? "Off" : p ? `${p.remaining} left` : "No package"}
          hint={!d.ptEnabled ? "Turn on in Settings" : p ? `${p.trainer_name} · packages, trainers, renewals` : "Add your first package"}
        />
        <Door
          href="/membership/gym"
          icon={<IdCard className="size-5" />}
          tone="teal"
          title="Gym membership"
          value={!d.membershipEnabled ? "Off" : !m || !ms ? "None" : ms.state === "expired" ? "Expired" : `${Math.max(ms.daysLeft, 0)} days left`}
          hint={m ? `${m.gym_name} · details and editing` : "Add your membership"}
        />
        <Door
          href="/membership/spending"
          icon={<Wallet className="size-5" />}
          tone="good"
          title="Spending"
          value={fmt(d.finance.totalSpent)}
          hint="Paid so far · charts and payments"
        />
      </div>

      {d.ptEnabled && (
        <div className="grid gap-4 lg:grid-cols-3">
          <MoneyScope id="dash-package">
            <PackageCard d={d} />
          </MoneyScope>
          <MoneyScope id="dash-missed">
            <MissedValueCard d={d} />
          </MoneyScope>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {d.membershipEnabled && (
          <MoneyScope id="dash-membership">
            <MembershipCard d={d} />
          </MoneyScope>
        )}
        <MoneyScope id="dash-money">
          <MoneyCard d={d} />
        </MoneyScope>
      </div>
    </div>
  );
}

const DOOR_TONE = {
  gold: { chip: "bg-gold-soft text-gold", glow: "var(--gold)" },
  teal: { chip: "bg-teal-soft text-teal", glow: "var(--teal)" },
  good: { chip: "bg-good-soft text-good", glow: "var(--good)" },
} as const;

/** A big tappable tile that opens one of the Membership sub-pages. */
function Door({ href, icon, tone, title, value, hint }: { href: string; icon: ReactNode; tone: keyof typeof DOOR_TONE; title: string; value: string; hint: string }) {
  const t = DOOR_TONE[tone];
  return (
    <Link
      href={href}
      className="group card-glow relative flex items-center gap-3 overflow-hidden rounded-2xl border bg-surface p-4 shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-pop sm:flex-col sm:items-stretch sm:p-5"
      style={{ ["--card-tone" as string]: t.glow }}
    >
      <div className="flex items-center justify-between">
        <span className={cx("grid size-10 place-items-center rounded-xl transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6", t.chip)}>{icon}</span>
        <ArrowUpRight className="hidden size-5 text-faint transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-ink sm:block" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink-2">{title}</p>
        <p className="num truncate font-display text-xl font-semibold tracking-tight sm:mt-0.5 sm:text-2xl">{value}</p>
        <p className="truncate text-xs text-muted sm:mt-0.5">{hint}</p>
      </div>
      <ArrowUpRight className="size-5 shrink-0 text-faint sm:hidden" />
    </Link>
  );
}
