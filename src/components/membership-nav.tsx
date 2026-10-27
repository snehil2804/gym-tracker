"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cx } from "@/components/ui";

const TABS = [
  { href: "/membership", label: "Overview" },
  { href: "/membership/training", label: "Personal training" },
  { href: "/membership/gym", label: "Gym membership" },
  { href: "/membership/spending", label: "Spending" },
];

/** Header for the Membership sub-pages: back link, title, and tabs to hop between them. */
export function MembershipHeader({ title, subtitle, actions }: { title: string; subtitle: string; actions?: ReactNode }) {
  const path = usePathname();
  return (
    <header className="mb-6">
      {path !== "/membership" && (
        <Link href="/membership" className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
          <ArrowLeft className="size-4" /> Membership insights
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[26px] leading-tight font-semibold tracking-tight text-ink sm:text-[30px]">{title}</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <nav aria-label="Membership pages" className="no-scrollbar -mx-1 mt-4 flex gap-1 overflow-x-auto px-1">
        {TABS.map((t) => {
          const active = path === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex h-9 shrink-0 items-center rounded-full px-4 text-sm font-medium transition-colors",
                active ? "bg-primary text-primary-ink shadow-card" : "border border-line bg-surface/70 text-ink-2 backdrop-blur hover:bg-surface",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
