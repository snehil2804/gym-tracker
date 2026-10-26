"use client";

import {
  BarChart3,
  CalendarDays,
  Dumbbell,
  History,
  IndianRupee,
  LayoutGrid,
  ListChecks,
  LogOut,
  MoreHorizontal,
  Package,
  Plus,
  Settings,
  Sun,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { PageFallback } from "@/components/page-fallback";
import { QuickLogProvider, useQuickLog } from "@/components/quick-log";
import { Sheet, cx } from "@/components/ui";
import { useProfile } from "@/lib/data/hooks";
import { getSupabase } from "@/lib/supabase/client";

const NAV = [
  { href: "/", label: "Today", icon: Sun },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/workouts", label: "Workouts", icon: Dumbbell },
  { href: "/progress", label: "Progress", icon: BarChart3 },
  { href: "/packages", label: "PT Packages", icon: Package },
  { href: "/finance", label: "Money", icon: IndianRupee },
  { href: "/history", label: "History", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
}

const noop = () => () => {};

/**
 * All data is per-user and fetched in the browser, so the app renders on the
 * client only. This avoids hydration mismatches from dates and cached data.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!mounted) return <PageFallback />;
  return (
    <QuickLogProvider>
      <Frame>{children}</Frame>
    </QuickLogProvider>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-2">
      <span className="grid size-8 place-items-center rounded-[10px] bg-primary text-primary-ink">
        <svg viewBox="0 0 64 64" className="size-6" aria-hidden>
          <rect x="14" y="27" width="6" height="10" rx="2" fill="currentColor" />
          <rect x="44" y="27" width="6" height="10" rx="2" fill="currentColor" />
          <rect x="20" y="22" width="5" height="20" rx="2" fill="currentColor" />
          <rect x="39" y="22" width="5" height="20" rx="2" fill="currentColor" />
          <rect x="25" y="30" width="14" height="4" rx="2" fill="var(--accent)" />
        </svg>
      </span>
      <span className="font-display text-[17px] font-semibold tracking-tight">Rep Ledger</span>
    </Link>
  );
}

async function signOut() {
  await getSupabase().auth.signOut();
  window.location.replace("/login");
}

function Frame({ children }: { children: ReactNode }) {
  const path = usePathname();
  const quick = useQuickLog();
  const [more, setMore] = useState(false);
  const { data: profile } = useProfile();

  return (
    <div className="min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-bg px-3 py-5 md:flex">
        <Brand />
        <button
          onClick={() => quick.open()}
          className="mt-6 flex h-11 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-ink transition-opacity hover:opacity-90"
        >
          <Plus className="size-4" /> Log training
        </button>
        <nav className="mt-6 flex flex-col gap-0.5" aria-label="Main">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={isActive(path, n.href) ? "page" : undefined}
              className={cx(
                "flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                isActive(path, n.href) ? "bg-surface text-ink shadow-card" : "text-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
              <n.icon className="size-[18px]" />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t border-line pt-4">
          <p className="truncate px-3 text-sm font-medium text-ink">{profile?.display_name ?? " "}</p>
          <button onClick={signOut} className="mt-1 flex h-9 w-full items-center gap-3 rounded-xl px-3 text-sm text-muted hover:bg-surface-2 hover:text-ink">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line/70 bg-bg/85 px-4 backdrop-blur md:hidden">
        <Brand />
        <Link href="/settings" aria-label="Settings" className="grid size-10 place-items-center rounded-full text-muted hover:bg-surface-2">
          <Settings className="size-5" />
        </Link>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pt-5 pb-28 sm:px-6 md:pl-[calc(15rem+1.5rem)] md:pt-8 md:pb-12 lg:pl-[calc(15rem+2.5rem)] lg:pr-10">
        {children}
      </main>

      {/* Mobile bottom navigation: the five most-used destinations, Log in the thumb zone. */}
      <nav
        aria-label="Main"
        className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur md:hidden"
      >
        <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center">
          <TabLink href="/" label="Today" icon={<Sun className="size-5" />} active={isActive(path, "/")} />
          <TabLink href="/calendar" label="Calendar" icon={<CalendarDays className="size-5" />} active={isActive(path, "/calendar")} />
          <div className="grid place-items-center">
            <button
              onClick={() => quick.open()}
              aria-label="Log training"
              className="grid size-13 -translate-y-3 place-items-center rounded-2xl bg-primary text-primary-ink shadow-pop transition-transform active:scale-95"
            >
              <Plus className="size-6" />
            </button>
          </div>
          <TabLink href="/workouts" label="Workouts" icon={<Dumbbell className="size-5" />} active={isActive(path, "/workouts")} />
          <button
            onClick={() => setMore(true)}
            className={cx(
              "flex flex-col items-center gap-0.5 text-[11px] font-medium",
              ["/packages", "/finance", "/progress", "/history", "/settings", "/review"].some((h) => isActive(path, h)) ? "text-ink" : "text-muted",
            )}
          >
            <MoreHorizontal className="size-5" />
            More
          </button>
        </div>
      </nav>

      <Sheet open={more} onClose={() => setMore(false)} title="More">
        <div className="grid grid-cols-2 gap-2 pb-2">
          {[
            { href: "/packages", label: "PT Packages", icon: Package },
            { href: "/finance", label: "Money", icon: IndianRupee },
            { href: "/progress", label: "Progress", icon: BarChart3 },
            { href: "/review", label: "Review days", icon: ListChecks },
            { href: "/history", label: "History", icon: History },
            { href: "/settings", label: "Settings", icon: Settings },
            { href: "/workouts/library", label: "Exercises", icon: LayoutGrid },
          ].map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setMore(false)}
              className="flex h-16 items-center gap-3 rounded-2xl border border-line bg-surface px-4 text-sm font-semibold text-ink hover:bg-surface-2"
            >
              <n.icon className="size-5 text-muted" />
              {n.label}
            </Link>
          ))}
          <button
            onClick={signOut}
            className="flex h-16 items-center gap-3 rounded-2xl border border-line bg-surface px-4 text-sm font-semibold text-muted hover:bg-surface-2"
          >
            <LogOut className="size-5" /> Sign out
          </button>
        </div>
      </Sheet>
    </div>
  );
}

function TabLink({ href, label, icon, active }: { href: string; label: string; icon: ReactNode; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx("flex flex-col items-center gap-0.5 text-[11px] font-medium", active ? "text-ink" : "text-muted")}
    >
      {icon}
      {label}
    </Link>
  );
}
