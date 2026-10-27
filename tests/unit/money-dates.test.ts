import { describe, expect, it } from "vitest";
import { costPerSession, formatMoney, parseMoneyToPaise, sessionValue } from "@/lib/domain/money";
import {
  addDays, addMonths, ageOn, daysBetween, endOfMonth, formatDate, isISODate, isoWeekday, monthGrid, startOfWeek, todayIn,
} from "@/lib/domain/dates";

describe("money (integer paise)", () => {
  it("T1: ₹6,000 / 30 sessions = ₹200 per session", () => {
    expect(costPerSession(600000, 30)).toBe(20000);
    expect(formatMoney(costPerSession(600000, 30))).toBe("₹200");
  });
  it("formats in the Indian system", () => {
    expect(formatMoney(600000)).toBe("₹6,000");
    expect(formatMoney(1250000)).toBe("₹12,500");
    expect(formatMoney(12345600)).toBe("₹1,23,456");
    expect(formatMoney(33333)).toBe("₹333.33");
  });
  it("parses input without floating-point error", () => {
    expect(parseMoneyToPaise("6000")).toBe(600000);
    expect(parseMoneyToPaise("₹ 6,000")).toBe(600000);
    expect(parseMoneyToPaise("0.1")).toBe(10);
    expect(parseMoneyToPaise("1234.56")).toBe(123456);
    expect(parseMoneyToPaise("-5")).toBeNull();
    expect(parseMoneyToPaise("12.345")).toBeNull();
    expect(parseMoneyToPaise("abc")).toBeNull();
  });
  it("allocates session value so totals reconcile exactly", () => {
    expect(sessionValue(3, 600000, 30)).toBe(60000); // ₹600 for 3 missed sessions
    expect(sessionValue(30, 1000000, 30)).toBe(1000000);
    expect(sessionValue(10, 1000000, 30) + sessionValue(20, 1000000, 30)).toBe(1000000);
    expect(sessionValue(0, 600000, 30)).toBe(0);
  });
});

describe("dates (T9)", () => {
  it("handles month and year boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(endOfMonth("2026-02-10")).toBe("2026-02-28");
    expect(endOfMonth("2028-02-10")).toBe("2028-02-29");
    expect(daysBetween("2026-12-25", "2027-01-05")).toBe(11);
  });
  it("adds months with clamping (membership estimate convention)", () => {
    expect(addMonths("2026-09-29", 3)).toBe("2026-12-29");
    expect(addDays(addMonths("2026-09-29", 3), -1)).toBe("2026-12-28");
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
  });
  it("identifies Sundays and weeks starting Monday", () => {
    expect(isoWeekday("2026-10-11")).toBe(7);
    expect(isoWeekday("2026-10-12")).toBe(1);
    expect(isoWeekday("2026-09-29")).toBe(2);
    expect(startOfWeek("2026-10-11")).toBe("2026-10-05");
    expect(startOfWeek("2027-01-01")).toBe("2026-12-28");
    expect(monthGrid("2026-10-15")[0]).toBe("2026-09-28");
  });
  it("uses the user's time zone for 'today', not UTC", () => {
    const lateUtc = new Date("2026-10-26T20:00:00Z"); // 01:30 on 27 Oct in India
    expect(todayIn("Asia/Kolkata", lateUtc)).toBe("2026-10-27");
    expect(todayIn("UTC", lateUtc)).toBe("2026-10-26");
    expect(todayIn("America/Los_Angeles", lateUtc)).toBe("2026-10-26");
    const newYear = new Date("2026-12-31T19:00:00Z"); // 00:30 on 1 Jan in India
    expect(todayIn("Asia/Kolkata", newYear)).toBe("2027-01-01");
  });
  it("calculates age from a birth date", () => {
    expect(ageOn("1999-10-27", "2026-10-27")).toBe(27);
    expect(ageOn("1999-10-28", "2026-10-27")).toBe(26);
    expect(ageOn("2000-02-29", "2027-02-28")).toBe(26);
    expect(ageOn(null, "2026-10-27")).toBeNull();
    expect(ageOn("2030-01-01", "2026-10-27")).toBeNull();
  });

  it("validates and formats ISO dates", () => {
    expect(isISODate("2026-02-30")).toBe(false);
    expect(isISODate("2026-10-26")).toBe(true);
    expect(formatDate("2026-10-26")).toBe("26 Oct 2026");
    expect(formatDate("2026-10-26", "dd/MM/yyyy")).toBe("26/10/2026");
  });
});
