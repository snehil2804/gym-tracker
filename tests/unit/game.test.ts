import { describe, expect, it } from "vitest";
import { computeGame, levelFor, XP } from "@/lib/domain/game";
import { att } from "./fixtures";

// 2026-10-05 is a Monday; 2026-10-11 is a Sunday.
const gym = (date: string) => att(date, { gym_status: "attended", pt_status: "not_scheduled" });
const both = (date: string) => att(date, { gym_status: "attended", pt_status: "completed" });
const absent = (date: string) => att(date, { gym_status: "absent", pt_status: "not_scheduled" });

describe("streak game", () => {
  it("counts consecutive wins and skips Sundays", () => {
    const days = ["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-12"].map(gym);
    const g = computeGame({ attendance: days, today: "2026-10-12", start: "2026-10-08" });
    expect(g.streak).toBe(4); // Thu, Fri, Sat, (Sun rest), Mon
    expect(g.best).toBe(4);
    expect(g.days.get("2026-10-11")).toBe("rest");
    // the rest day sits inside the trail
    expect(g.chain.get("2026-10-11")).toBe(g.chain.get("2026-10-12"));
  });

  it("a miss breaks the streak and costs XP", () => {
    const g = computeGame({ attendance: [gym("2026-10-05"), gym("2026-10-06"), absent("2026-10-07")], today: "2026-10-07", start: "2026-10-05" });
    expect(g.streak).toBe(0);
    expect(g.best).toBe(2);
    expect(g.lastBreak).toEqual({ date: "2026-10-07", lost: 2, xp: XP.miss });
    // 10 + (10 + 1) − 15
    expect(g.xp).toBe(6);
  });

  it("an unlogged past day stops the chain without a penalty; today stays open", () => {
    const g = computeGame({ attendance: [gym("2026-10-05")], today: "2026-10-07", start: "2026-10-05" });
    expect(g.days.get("2026-10-06")).toBe("unlogged");
    expect(g.days.get("2026-10-07")).toBe("pending");
    expect(g.streak).toBe(0);
    expect(g.xp).toBe(10);
    expect(g.todayOpen).toBe(true);
  });

  it("today not logged yet keeps yesterday's streak alive", () => {
    const g = computeGame({ attendance: [gym("2026-10-05"), gym("2026-10-06")], today: "2026-10-07", start: "2026-10-05" });
    expect(g.streak).toBe(2);
  });

  it("gym + PT is a double day with bonus XP", () => {
    const g = computeGame({ attendance: [both("2026-10-05")], today: "2026-10-05", start: "2026-10-05" });
    expect(g.days.get("2026-10-05")).toBe("double");
    expect(g.xp).toBe(XP.win + XP.double);
    expect(g.badges.find((b) => b.id === "double")?.earned).toBe(true);
  });

  it("trainer cancellations and planned breaks don't break the streak", () => {
    const g = computeGame({
      attendance: [gym("2026-10-05"), att("2026-10-06", { pt_status: "trainer_cancelled" }), gym("2026-10-08")],
      today: "2026-10-08",
      start: "2026-10-05",
      isBreak: (d) => d === "2026-10-07",
    });
    expect(g.streak).toBe(2);
  });

  it("cancelling your own session counts as a miss", () => {
    const g = computeGame({ attendance: [gym("2026-10-05"), att("2026-10-06", { pt_status: "client_cancelled" })], today: "2026-10-06", start: "2026-10-05" });
    expect(g.days.get("2026-10-06")).toBe("missed");
    expect(g.streak).toBe(0);
  });

  it("awards a perfect month when every training day of a finished month is won", () => {
    const att = [];
    for (let day = 1; day <= 30; day++) {
      const d = `2026-11-${String(day).padStart(2, "0")}`;
      if (new Date(`${d}T00:00:00Z`).getUTCDay() !== 0) att.push(gym(d));
    }
    const g = computeGame({ attendance: att, today: "2026-12-01", start: "2026-11-01" });
    const nov = g.months.get("2026-11")!;
    expect(nov.perfect).toBe(true);
    expect(g.badges.find((b) => b.id === "pm")?.earned).toBe(true);
    expect(g.badges.find((b) => b.id === "pw")?.earned).toBe(true);
  });

  it("a single miss spoils the month", () => {
    const g = computeGame({ attendance: [gym("2026-10-05"), absent("2026-10-06")], today: "2026-10-07", start: "2026-10-05" });
    expect(g.months.get("2026-10")!.stillPerfect).toBe(false);
  });

  it("levels up with XP", () => {
    expect(levelFor(0)).toMatchObject({ n: 1, title: "Rookie" });
    expect(levelFor(150)).toMatchObject({ n: 2, title: "Regular" });
    expect(levelFor(10000)).toMatchObject({ title: "Legend", to: null, progress: 1 });
  });
});
