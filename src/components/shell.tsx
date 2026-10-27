"use client";

import {
  BarChart3,
  CalendarDays,
  Dumbbell,
  History,
  IdCard,
  LayoutGrid,
  ListChecks,
  LogOut,
  MoreHorizontal,
  Plus,
  Settings,
  Sun,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Avatar } from "@/components/avatar";
import { LIFT_DROP_MS, LiftLogo } from "@/components/logo";
import { FeaturesProvider, PrivacyProvider } from "@/components/preferences";
import { PageFallback } from "@/components/page-fallback";
import { QuickLogProvider, useQuickLog } from "@/components/quick-log";
import { Sheet, cx } from "@/components/ui";
import { useProfile } from "@/lib/data/hooks";
import { getSupabase } from "@/lib/supabase/client";

/**
 * Each destination has its own colour (`tone`: text + soft chip) and its own icon move (`anim`,
 * see `.ico-*` in globals.css) that plays on hover and when the page opens.
 */
const NAV = [
  { href: "/", label: "Today", icon: Sun, anim: "ico-sun", tone: "text-warn", chip: "bg-warn-soft", hover: "group-hover:bg-warn-soft group-hover:text-warn" },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, anim: "ico-cal", tone: "text-info", chip: "bg-info-soft", hover: "group-hover:bg-info-soft group-hover:text-info" },
  { href: "/workouts", label: "Workouts", icon: Dumbbell, anim: "ico-lift", tone: "text-good", chip: "bg-good-soft", hover: "group-hover:bg-good-soft group-hover:text-good" },
  { href: "/progress", label: "Progress", icon: BarChart3, anim: "ico-bars", tone: "text-teal", chip: "bg-teal-soft", hover: "group-hover:bg-teal-soft group-hover:text-teal" },
  { href: "/membership", label: "Membership", icon: IdCard, anim: "ico-coin", tone: "text-gold", chip: "bg-gold-soft", hover: "group-hover:bg-gold-soft group-hover:text-gold" },
  { href: "/history", label: "History", icon: History, anim: "ico-rewind", tone: "text-info", chip: "bg-info-soft", hover: "group-hover:bg-info-soft group-hover:text-info" },
  { href: "/settings", label: "Settings", icon: Settings, anim: "ico-gear", tone: "text-ink-2", chip: "bg-surface-3", hover: "group-hover:bg-surface-3 group-hover:text-ink-2" },
];
const MORE_EXTRA = {
  "/review": { label: "Review days", icon: ListChecks, anim: "ico-pop", tone: "text-warn", chip: "bg-warn-soft", hover: "group-hover:bg-warn-soft group-hover:text-warn" },
  "/workouts/library": { label: "Exercises", icon: LayoutGrid, anim: "ico-pop", tone: "text-good", chip: "bg-good-soft", hover: "group-hover:bg-good-soft group-hover:text-good" },
};
const navItem = (href: string) => NAV.find((n) => n.href === href)!;

function isActive(path: string, href: string) {
  if (href === "/membership" && path.startsWith("/packages")) return true; // package pages belong to Membership
  return href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
}

const noop = () => () => {};

/**
 * All data is per-user and fetched in the browser, so the app renders on the
 * client only. This avoids hydration mismatches from dates and cached data.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const { data: profile, isLoading, error: profileError, refetch } = useProfile();
  const router = useRouter();
  const needsOnboarding = !!profile && !profile.onboarded_at;
  const [gone, setGone] = useState(false);

  // If the profile can't be loaded, find out whether the account still exists. A session that
  // outlived its account (deleted on another device) is signed out instead of spinning forever.
  useEffect(() => {
    if (!profileError) return;
    let cancelled = false;
    getSupabase()
      .auth.getUser()
      .then(async ({ data, error }) => {
        if (cancelled) return;
        if (error || !data.user) {
          await getSupabase().auth.signOut({ scope: "local" });
          window.location.replace("/login?deleted=1");
        } else {
          setGone(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [profileError]);
  useEffect(() => {
    if (needsOnboarding) router.replace("/welcome");
  }, [needsOnboarding, router]);
  if (gone)
    return (
      <div className="mx-auto max-w-md px-6 pt-24 text-center">
        <p className="font-display text-xl font-semibold">Couldn&apos;t load your profile</p>
        <p className="mt-2 text-sm text-muted">Check your connection and try again.</p>
        <button className="mt-5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-ink" onClick={() => (setGone(false), refetch())}>
          Try again
        </button>
      </div>
    );
  if (!mounted || isLoading || !profile || needsOnboarding) return <PageFallback />;
  return (
    <FeaturesProvider value={{ pt: profile.pt_enabled, membership: profile.membership_enabled }}>
      <PrivacyProvider>
        <QuickLogProvider>
          <Frame>{children}</Frame>
        </QuickLogProvider>
      </PrivacyProvider>
    </FeaturesProvider>
  );
}

/** How long after a click the replayed bar hits the floor (and the page shakes). */
const CLICK_DROP_MS = 380;

/** Ask the page to shake after `delay` ms (listened to by `useQuake`). */
function requestQuake(delay = 0) {
  window.dispatchEvent(new CustomEvent("rl-quake", { detail: { delay } }));
}

function Brand() {
  // Each click remounts the logo part-way through its cycle so the bar drops right away.
  const [replay, setReplay] = useState(0);
  return (
    <Link
      href="/"
      className="group flex items-center gap-2.5 px-2"
      aria-label="Rep Ledger — Today"
      onClick={() => {
        setReplay((n) => n + 1);
        requestQuake(CLICK_DROP_MS);
      }}
    >
      <LiftLogo key={replay} size={34} className="shadow-brand" startAt={replay ? LIFT_DROP_MS - CLICK_DROP_MS : 0} />
      <span className="font-display text-[17px] font-semibold tracking-tight">Rep Ledger</span>
    </Link>
  );
}

/**
 * The page shakes when the lifter drops the bar: once per browser session on first load (right
 * after signing in), and every time the logo is clicked.
 */
function useQuake() {
  const [n, setN] = useState(0); // >0 while shaking
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const shake = (delay: number) => {
      timers.push(setTimeout(() => setN((x) => (x % 1000) + 1), delay));
      timers.push(setTimeout(() => setN(0), delay + 600));
    };
    const onQuake = (e: Event) => shake((e as CustomEvent<{ delay?: number }>).detail?.delay ?? 0);
    window.addEventListener("rl-quake", onQuake);
    let intro = false;
    try {
      intro = !sessionStorage.getItem("rl-intro-quake");
    } catch {}
    if (intro) {
      // The flag is written only when the quake actually plays, so a cancelled run can retry.
      timers.push(
        setTimeout(() => {
          try {
            sessionStorage.setItem("rl-intro-quake", "1");
          } catch {}
        }, LIFT_DROP_MS),
      );
      shake(LIFT_DROP_MS);
    }
    return () => {
      window.removeEventListener("rl-quake", onQuake);
      timers.forEach(clearTimeout);
    };
  }, []);
  return n;
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
  const quake = useQuake();
  // On Settings the profile-photo backdrop runs under the menus, so they turn see-through there.
  const glass = path === "/settings";

  return (
    <div className={cx("min-h-dvh", quake > 0 && "anim-quake")}>
      {/* Desktop sidebar */}
      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r px-3 py-5 backdrop-blur-xl transition-colors duration-500 md:flex",
          glass ? "border-white/25 bg-bg/25" : "border-line/70 bg-bg/70",
        )}
      >
        <Brand />
        <button
          onClick={() => quick.open()}
          className="group bg-brand shadow-brand mt-6 flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-[transform,filter] hover:brightness-110 active:scale-[0.98]"
        >
          <Plus className="size-4 transition-transform duration-300 group-hover:rotate-90" /> Log training
        </button>
        <nav className="mt-6 flex flex-col gap-0.5" aria-label="Main">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={isActive(path, n.href) ? "page" : undefined}
              className={cx(
                "group flex h-11 items-center gap-3 rounded-xl px-2 text-sm font-medium transition-colors",
                isActive(path, n.href) ? "bg-surface text-ink shadow-card" : "text-muted hover:bg-surface/70 hover:text-ink",
              )}
            >
              <span
                className={cx(
                  "grid size-8 place-items-center rounded-lg transition-colors",
                  isActive(path, n.href) ? cx(n.chip, n.tone) : n.hover,
                )}
              >
                <n.icon className={cx("ico size-[18px]", n.anim)} />
              </span>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t border-line pt-4">
          <Link href="/settings" className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-surface-2">
            <Avatar size={34} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-ink">{profile?.display_name ?? " "}</span>
              <span className="block text-xs text-muted">Profile & settings</span>
            </span>
          </Link>
          <button onClick={signOut} className="mt-1 flex h-9 w-full items-center gap-3 rounded-xl px-3 text-sm text-muted hover:bg-surface-2 hover:text-ink">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      {/* Phone top bar: logo and name centred, profile on the right. */}
      <header
        className={cx(
          "sticky top-0 z-30 grid h-14 grid-cols-[2.5rem_1fr_2.5rem] items-center border-b px-3 backdrop-blur-xl transition-colors duration-500 md:hidden",
          glass ? "border-white/20 bg-bg/25" : "border-line/60 bg-bg/75",
        )}
      >
        <span aria-hidden />
        <div className="flex justify-center">
          <Brand />
        </div>
        <Link href="/settings" aria-label="Profile and settings" className="grid size-10 place-items-center rounded-full hover:bg-surface-2">
          <Avatar size={32} />
        </Link>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pt-5 pb-28 sm:px-6 md:pl-[calc(15rem+1.5rem)] md:pt-8 md:pb-12 lg:pl-[calc(15rem+2.5rem)] lg:pr-10">
        {children}
      </main>

      {/* Mobile bottom navigation: the five most-used destinations, Log in the thumb zone. */}
      <nav
        aria-label="Main"
        className={cx("pb-safe fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur-xl transition-colors duration-500 md:hidden", glass ? "border-white/20 bg-surface/45" : "border-line/70 bg-surface/80")}
      >
        <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center">
          <TabLink item={navItem("/")} active={isActive(path, "/")} />
          <TabLink item={navItem("/calendar")} active={isActive(path, "/calendar")} />
          <div className="grid place-items-center">
            <button
              onClick={() => quick.open()}
              aria-label="Log training"
              className="bg-brand shadow-brand grid size-13 -translate-y-3 place-items-center rounded-2xl transition-transform active:scale-95"
            >
              <Plus className="size-6" />
            </button>
          </div>
          <TabLink item={navItem("/workouts")} active={isActive(path, "/workouts")} />
          <button
            onClick={() => setMore(true)}
            className={cx(
              "flex flex-col items-center gap-0.5 text-[11px] font-medium",
              ["/membership", "/packages", "/progress", "/history", "/settings", "/review"].some((h) => isActive(path, h)) ? "text-ink" : "text-muted",
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
            navItem("/membership"),
            navItem("/progress"),
            ...(profile?.pt_enabled ? [{ href: "/review", ...MORE_EXTRA["/review"] }] : []),
            navItem("/history"),
            navItem("/settings"),
            { href: "/workouts/library", ...MORE_EXTRA["/workouts/library"] },
          ].map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setMore(false)}
              className="group flex h-16 items-center gap-3 rounded-2xl border border-line bg-surface px-3 text-sm font-semibold text-ink transition-colors hover:bg-surface-2 active:scale-[0.98]"
            >
              <span className={cx("grid size-10 shrink-0 place-items-center rounded-xl", n.chip, n.tone)}>
                <n.icon className={cx("ico size-5", n.anim)} />
              </span>
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

function TabLink({ item, active }: { item: (typeof NAV)[number]; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cx("group flex flex-col items-center gap-0.5 text-[11px] font-medium", active ? "text-ink" : "text-muted")}
    >
      <span className={cx("grid h-7 w-12 place-items-center rounded-full transition-colors", active && cx(item.chip, item.tone))}>
        <item.icon className={cx("ico size-5", item.anim)} />
      </span>
      {item.label}
    </Link>
  );
}
