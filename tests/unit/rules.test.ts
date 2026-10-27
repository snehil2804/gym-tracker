import { describe, expect, it } from "vitest";
import { classifyDay, dayLabel, firstName, needsReview, PT_ONLY_KINDS, PT_STATUS, selfCancelledLabel } from "@/lib/domain/attendance";
import { computeFinance, missedByMonth } from "@/lib/domain/finance";
import { forecastPackage, upcomingSessionDates } from "@/lib/domain/forecast";
import { currentStreak, gymAttendance, personalRecords } from "@/lib/domain/stats";
import { buildInsights } from "@/lib/domain/insights";
import { toCSV } from "@/lib/domain/csv";
import { eachDay } from "@/lib/domain/dates";
import type { Workout } from "@/lib/types";
import { att, led, pay, pkg, seededAttendance, SEEDED_ABSENCES } from "./fixtures";

const ctx = { today: "2026-10-26", trackingStart: "2026-09-29", scheduleDays: [1, 2, 3, 4, 5, 6] };
const base = { ledger: [], payments: [], memberships: [], attendance: [], today: "2026-10-26" };

describe("attendance rules", () => {
  it("only completed and chargeable PT consume a session", () => {
    const consuming = Object.entries(PT_STATUS).filter(([, v]) => v.consumes).map(([k]) => k);
    expect(consuming.sort()).toEqual(["chargeable_absence", "completed"]);
  });

  it("without personal training, days read as gym days and nothing needs review", () => {
    const gymCtx = { ...ctx, scheduleDays: [] };
    expect(needsReview("2026-10-12", undefined, gymCtx)).toBe(false);
    expect(classifyDay("2026-10-12", undefined, gymCtx)).toBe("not_scheduled");
    expect(dayLabel("not_scheduled", false)).toBe("Not logged");
    expect(dayLabel("gym_only", false)).toBe("Went to gym");
    expect(dayLabel("not_scheduled", true)).toBe("No PT scheduled");
    expect(PT_ONLY_KINDS).not.toContain("rest");
  });

  it("a session you cancelled is never deducted", () => {
    expect(PT_STATUS.client_cancelled.consumes).toBe(false);
  });

  it("labels your own cancellations with your name when it is a real name", () => {
    expect(selfCancelledLabel("Snehil Rai")).toBe("Snehil cancelled");
    expect(selfCancelledLabel("snehilrai678.sr")).toBe("I cancelled");
    expect(selfCancelledLabel(null)).toBe("I cancelled");
    expect(firstName("asha")).toBe("Asha");
  });

  it("T13: the ten seeded absences are represented correctly", () => {
    const rows = seededAttendance();
    expect(rows.map((r) => r.date)).toEqual(SEEDED_ABSENCES);
    expect(rows.every((r) => r.gym_status === "absent")).toBe(true);
    const sunday = rows.find((r) => r.date === "2026-10-11")!;
    expect(sunday.pt_status).toBe("not_scheduled");
    expect(classifyDay(sunday.date, sunday, ctx)).toBe("missed");
    expect(needsReview(sunday.date, sunday, ctx)).toBe(false);
    const monday = rows.find((r) => r.date === "2026-10-12")!;
    expect(classifyDay(monday.date, monday, ctx)).toBe("missed_unconfirmed");
    expect(needsReview(monday.date, monday, ctx)).toBe(true);
  });

  it("T12: unlogged past days stay unverified, never completed or missed", () => {
    expect(classifyDay("2026-10-02", undefined, ctx)).toBe("unverified");
    expect(classifyDay("2026-10-18", undefined, ctx)).toBe("rest"); // Sunday: rest day by default
    expect(needsReview("2026-10-18", undefined, ctx)).toBe(false);
    expect(classifyDay("2026-11-01", undefined, ctx)).toBe("rest"); // future Sunday too
    expect(classifyDay("2026-09-27", undefined, ctx)).toBe("before"); // Sunday before tracking
    expect(classifyDay("2026-09-20", undefined, ctx)).toBe("before");
    expect(classifyDay("2026-10-30", undefined, ctx)).toBe("future");
    expect(needsReview("2026-10-30", undefined, ctx)).toBe(false);
  });

  it("classifies every calendar state distinctly", () => {
    expect(classifyDay("2026-10-05", att("2026-10-05", { gym_status: "attended", pt_status: "completed" }), ctx)).toBe("trained");
    expect(classifyDay("2026-10-05", att("2026-10-05", { gym_status: "absent", pt_status: "completed" }), ctx)).toBe("pt_only");
    expect(classifyDay("2026-10-05", att("2026-10-05", { gym_status: "attended", pt_status: "not_scheduled" }), ctx)).toBe("gym_only");
    expect(classifyDay("2026-10-05", att("2026-10-05", { gym_status: "absent", pt_status: "chargeable_absence" }), ctx)).toBe("charged");
    expect(classifyDay("2026-10-05", att("2026-10-05", { pt_status: "trainer_cancelled" }), ctx)).toBe("cancelled");
    expect(classifyDay("2026-10-05", att("2026-10-05", { pt_status: "rescheduled" }), ctx)).toBe("rescheduled");
    expect(classifyDay("2026-10-05", att("2026-10-05", { gym_status: "absent", pt_status: "client_cancelled" }), ctx)).toBe("self_cancelled");
    // A logged Sunday overrides the rest-day default.
    expect(classifyDay("2026-10-18", att("2026-10-18", { gym_status: "attended", pt_status: "not_scheduled" }), ctx)).toBe("gym_only");
    expect(classifyDay("2026-10-05", att("2026-10-05", { gym_status: "rest", pt_status: "not_scheduled" }), ctx)).toBe("rest");
  });
});

describe("finance (T10, T15)", () => {
  it("T4/T5: gym absences and trainer cancellations are not losses", () => {
    const p = pkg({ trainer_cancelled: 2, remaining: 30 });
    const f = computeFinance({ ...base, packages: [p], attendance: [att("2026-10-11", { gym_status: "absent", pt_status: "not_scheduled" })] });
    expect(f.missedValue).toBe(0);
    expect(f.cancelledValue).toBe(40000);
    expect(f.remainingValue).toBe(600000);
  });

  it("reconciles completed + missed + remaining with the package price", () => {
    const p = pkg({ completed: 5, forfeited: 3, remaining: 22 });
    const ledger = [
      ...["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"].map((d) => led(p.id, "completed", d)),
      led(p.id, "forfeited", "2026-09-30"),
      led(p.id, "forfeited", "2026-10-14"),
      led(p.id, "forfeited", "2026-10-16"),
      led(p.id, "forfeited", "2026-10-20", { voided_at: "2026-10-21T00:00:00Z", void_reason: "corrected" }),
    ];
    const f = computeFinance({ ...base, packages: [p], ledger });
    expect(f.completedValue).toBe(100000);
    expect(f.missedValue).toBe(60000); // voided entry ignored
    expect(f.missedValueThisMonth).toBe(40000); // only October entries
    expect(f.missedSessionsThisMonth).toBe(2);
    expect(f.completedValue + f.missedValue + f.remainingValue).toBe(p.price_paise);
    expect(missedByMonth(ledger, [p])).toEqual([
      { month: "2026-09", sessions: 1, value: 20000 },
      { month: "2026-10", sessions: 2, value: 40000 },
    ]);
  });

  it("T7: each package keeps its own rate after renewal", () => {
    const old = pkg({ status: "completed", closed_on: "2026-11-01", remaining: 0, completed: 29, forfeited: 1 });
    const fresh = pkg({ price_paise: 800000, sessions_purchased: 24, start_date: "2026-11-02", remaining: 23, forfeited: 1 });
    const ledger = [led(old.id, "forfeited", "2026-10-14"), led(fresh.id, "forfeited", "2026-11-03")];
    const f = computeFinance({ ...base, today: "2026-11-10", packages: [old, fresh], ledger });
    expect(f.missedValue).toBe(20000 + 33333);
    expect(f.missedValueThisMonth).toBe(33333);
    expect(f.remainingValue).toBe(Math.round((23 * 800000) / 24));
  });

  it("T15: pending payments are never counted as spent", () => {
    const p = pkg();
    const payments = [pay(p.id, 200000), pay(p.id, 400000, { status: "pending", paid_on: null })];
    const f = computeFinance({ ...base, packages: [{ ...p, paid_paise: 200000 }], payments });
    expect(f.ptPaid).toBe(200000);
    expect(f.ptPendingScheduled).toBe(400000);
    expect(f.ptOutstanding).toBe(400000);
    expect(f.totalSpent).toBe(200000);
  });

  it("membership price only counts as spent once paid", () => {
    const m = {
      id: "m", gym_name: "19Fitness", start_date: "2026-09-29", duration_months: 3, estimated_end_date: "2026-12-28",
      confirmed_end_date: null, price_paise: 500000, price_is_approximate: true, payment_status: "unconfirmed" as const,
      paid_on: null, notes: null, created_at: "",
    };
    expect(computeFinance({ ...base, packages: [], memberships: [m] }).gymPaid).toBe(0);
    expect(computeFinance({ ...base, packages: [], memberships: [{ ...m, payment_status: "paid" }] }).gymPaid).toBe(500000);
  });

  it("seeded data: nothing is a confirmed loss; nine days await review (≤ ₹1,800)", () => {
    const p = pkg();
    const f = computeFinance({ ...base, packages: [p], attendance: seededAttendance() });
    expect(f.missedValue).toBe(0);
    expect(f.missedSessions).toBe(0);
    expect(f.pendingReviewDays).toBe(9);
    expect(f.pendingReviewValue).toBe(180000);
    expect(f.remainingSessions).toBe(30);
    expect(f.totalSpent).toBe(0);
  });
});

describe("forecast (T9)", () => {
  const sched = [1, 2, 3, 4, 5, 6];
  it("estimates the final session date skipping Sundays", () => {
    const f = forecastPackage({ from: "2026-10-27", remaining: 30, scheduleDays: sched, blocks: [] });
    expect(f.nextSession).toBe("2026-10-27");
    expect(f.finalDate).toBe("2026-11-30");
  });
  it("accounts for vacations and package pauses", () => {
    const vacation = { id: "b", kind: "vacation" as const, start_date: "2026-11-02", end_date: "2026-11-07", package_id: null, note: null };
    expect(forecastPackage({ from: "2026-10-27", remaining: 30, scheduleDays: sched, blocks: [vacation] }).finalDate).toBe("2026-12-07");
    const otherPause = { ...vacation, kind: "pause" as const, package_id: "other" };
    expect(forecastPackage({ from: "2026-10-27", remaining: 30, scheduleDays: sched, blocks: [otherPause], packageId: "mine" }).finalDate).toBe("2026-11-30");
  });
  it("flags sessions that would be unused at expiry", () => {
    const f = forecastPackage({ from: "2026-10-27", remaining: 30, scheduleDays: sched, blocks: [], expiry: "2026-11-15" });
    expect(f.opportunitiesBeforeExpiry).toBe(17);
    expect(f.unusedAtExpiry).toBe(13);
    expect(f.runsPastExpiry).toBe(true);
  });
  it("starts a future package on its start date and crosses year boundaries", () => {
    expect(forecastPackage({ from: "2026-10-27", remaining: 1, scheduleDays: sched, blocks: [], packageStart: "2026-11-02" }).nextSession).toBe("2026-11-02");
    expect(forecastPackage({ from: "2026-12-28", remaining: 6, scheduleDays: sched, blocks: [] }).finalDate).toBe("2027-01-02");
    expect(upcomingSessionDates("2026-10-31", 2, [1, 3, 5], [])).toEqual(["2026-11-02", "2026-11-04"]);
  });
  it("returns no estimate for an exhausted package", () => {
    expect(forecastPackage({ from: "2026-10-27", remaining: 0, scheduleDays: sched, blocks: [] }).finalDate).toBeNull();
  });
});

describe("stats", () => {
  it("excludes unknown days from attendance rate", () => {
    const rows = [
      att("2026-10-05", { gym_status: "attended" }),
      att("2026-10-06", { gym_status: "absent" }),
      att("2026-10-07", { gym_status: "unverified" }),
    ];
    const r = gymAttendance(rows, "2026-10-01", "2026-10-31");
    expect(r).toMatchObject({ attended: 1, missed: 1, unverified: 1, rate: 0.5 });
    expect(gymAttendance([], "2026-10-01", "2026-10-31").rate).toBeNull();
  });
  it("counts streaks without assuming unknown days were attended", () => {
    const rows = eachDay("2026-10-19", "2026-10-24").map((d) => att(d, { gym_status: "attended" }));
    expect(currentStreak(rows, "2026-10-26")).toBe(6); // today not logged yet: count from yesterday (Sunday skipped)
    expect(currentStreak(rows, "2026-10-27")).toBe(0); // Monday 26th unknown → streak broken
    expect(currentStreak(rows, "2026-10-25")).toBe(6); // Sunday skipped, Mon–Sat attended
    expect(currentStreak([...rows, att("2026-10-26", { gym_status: "attended" })], "2026-10-26")).toBe(7);
  });
  it("derives personal records from saved workouts only", () => {
    const w = (date: string, kg: number): Workout => ({
      id: date, workout_date: date, start_time: null, title: null, workout_type: null, muscle_groups: [], duration_min: 60,
      cardio_type: null, cardio_min: null, distance_km: null, energy_level: null, with_trainer: true, trainer_notes: null,
      personal_notes: null, discomfort_notes: null, created_at: "", updated_at: "",
      exercises: [{ id: `we-${date}`, exercise_id: "bench", position: 0, rest_seconds: null, notes: null,
        exercise: { id: "bench", name: "Bench Press", primary_muscle: "chest", category: "strength" },
        sets: [{ set_number: 1, reps: 8, weight_kg: kg, duration_sec: null, is_warmup: false }] }],
    });
    const prs = personalRecords([w("2026-10-05", 30), w("2026-10-12", 35)]);
    expect(prs[0]).toMatchObject({ name: "Bench Press", weight: 35, firstWeight: 30, sessions: 2, date: "2026-10-12" });
    expect(personalRecords([])).toEqual([]);
  });
});

describe("insights", () => {
  it("does not fabricate insights without data", () => {
    const f = computeFinance({ ...base, packages: [] });
    expect(buildInsights({ today: "2026-10-26", finance: f, attendance: [], reviewCount: 0 })).toEqual([]);
  });
});

describe("csv", () => {
  it("escapes commas, quotes and newlines", () => {
    expect(toCSV([{ a: 'x,"y"', b: 1, c: null }])).toBe('a,b,c\r\n"x,""y""",1,');
  });
});
