"use client";

import { useMemo } from "react";
import { needsReview, type DayContext } from "@/lib/domain/attendance";
import { addDays, eachDay, isoWeekday, startOfWeek } from "@/lib/domain/dates";
import { activePackageOn, computeFinance } from "@/lib/domain/finance";
import { forecastPackage } from "@/lib/domain/forecast";
import { buildReminders } from "@/lib/domain/reminders";
import { workoutsBetween } from "@/lib/domain/stats";
import type { Attendance, PackageSummary } from "@/lib/types";
import {
  useAttendance,
  useBlocks,
  useLedger,
  useMemberships,
  usePackages,
  usePayments,
  useProfile,
  useToday,
  useWorkouts,
} from "./hooks";

const DEFAULT_SCHEDULE = [1, 2, 3, 4, 5, 6];

/** The package that "today" is about: active and covering today, else the next upcoming one, else the latest. */
export function pickCurrentPackage(packages: PackageSummary[], today: string): PackageSummary | undefined {
  const usable = packages.filter((p) => p.status === "active");
  const covering = usable
    .filter((p) => p.start_date <= today && (!p.expiry_date || today <= p.expiry_date || p.extension_allowed))
    .sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
  return (
    covering.find((p) => p.remaining > 0) ??
    usable.filter((p) => p.start_date > today).sort((a, b) => (a.start_date < b.start_date ? -1 : 1))[0] ??
    covering[0] ??
    packages[0]
  );
}

export function useCore() {
  const today = useToday();
  const profile = useProfile();
  const packages = usePackages();
  const attendance = useAttendance();
  const ledger = useLedger();
  const payments = usePayments();
  const memberships = useMemberships();
  const blocks = useBlocks();
  const workouts = useWorkouts();

  const loading =
    profile.isLoading || packages.isLoading || attendance.isLoading || ledger.isLoading || payments.isLoading || memberships.isLoading || blocks.isLoading;
  const error = profile.error || packages.error || attendance.error || ledger.error || payments.error || memberships.error || blocks.error;

  const derived = useMemo(() => {
    if (loading || error || !profile.data) return null;
    const pkgs = packages.data ?? [];
    const att = attendance.data ?? [];
    const byDate = new Map<string, Attendance>(att.map((a) => [a.date, a]));
    const current = pickCurrentPackage(pkgs, today);
    const scheduleDays = current?.schedule_days ?? DEFAULT_SCHEDULE;
    const trackingStart = profile.data.tracking_start_date ?? current?.start_date ?? null;
    const dayCtx: DayContext = { today, trackingStart, scheduleDays };

    const todayRec = byDate.get(today);
    const ptSettledToday = !!todayRec && ["completed", "chargeable_absence", "trainer_cancelled", "rescheduled", "not_scheduled"].includes(todayRec.pt_status);
    const forecastFrom = ptSettledToday ? addDays(today, 1) : today;
    const forecast = current
      ? forecastPackage({
          from: forecastFrom,
          remaining: current.remaining,
          scheduleDays: current.schedule_days,
          blocks: blocks.data ?? [],
          packageId: current.id,
          packageStart: current.start_date,
          expiry: current.expiry_date,
        })
      : undefined;

    // Review queue: past days (not today) that still need confirming.
    const reviewDays: string[] = [];
    if (trackingStart && trackingStart <= today) {
      for (const d of eachDay(trackingStart, addDays(today, -1))) {
        if (needsReview(d, byDate.get(d), dayCtx)) reviewDays.push(d);
      }
    }

    const finance = computeFinance({
      packages: pkgs,
      ledger: ledger.data ?? [],
      payments: payments.data ?? [],
      memberships: memberships.data ?? [],
      attendance: att,
      today,
      trackingStart,
    });

    const membership = (memberships.data ?? []).find((m) => m.start_date <= today) ?? memberships.data?.[0];
    const weekStart = startOfWeek(today);
    const lastWeekWorkouts = workoutsBetween(workouts.data ?? [], addDays(weekStart, -7), addDays(weekStart, -1)).length;
    const todayScheduled = scheduleDays.includes(isoWeekday(today));

    const reminders = buildReminders({
      profile: profile.data,
      today,
      membership,
      pkg: current,
      forecast,
      reviewCount: reviewDays.length,
      todayLogged: !!todayRec,
      todayScheduled,
      outstandingPaise: finance.ptOutstanding,
      pendingPaymentPaise: finance.ptPendingScheduled,
      lastWeekWorkouts,
    });

    return {
      today,
      profile: profile.data,
      packages: pkgs,
      current,
      activeOn: (d: string) => activePackageOn(pkgs, d),
      attendance: att,
      byDate,
      todayRec,
      ledger: ledger.data ?? [],
      payments: payments.data ?? [],
      memberships: memberships.data ?? [],
      membership,
      blocks: blocks.data ?? [],
      workouts: workouts.data ?? [],
      scheduleDays,
      trackingStart,
      dayCtx,
      forecast,
      reviewDays,
      finance,
      reminders,
      todayScheduled,
    };
  }, [loading, error, profile.data, packages.data, attendance.data, ledger.data, payments.data, memberships.data, blocks.data, workouts.data, today]);

  return { loading, error, data: derived, workoutsLoading: workouts.isLoading };
}

export type Core = NonNullable<ReturnType<typeof useCore>["data"]>;
