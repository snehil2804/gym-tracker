import { describe, expect, it } from "vitest";
import { spendByMonth } from "@/lib/domain/finance";
import type { Membership, Payment } from "@/lib/types";

const membership = (o: Partial<Membership>): Membership => ({
  id: "m",
  gym_name: "Gym",
  start_date: "2026-09-29",
  duration_months: 3,
  estimated_end_date: "2026-12-28",
  confirmed_end_date: null,
  price_paise: 500000,
  price_is_approximate: false,
  payment_status: "paid",
  paid_on: null,
  notes: null,
  created_at: "2026-09-29T00:00:00Z",
  ...o,
});
const payment = (o: Partial<Payment>): Payment => ({
  id: "p",
  package_id: "k",
  kind: "payment",
  amount_paise: 600000,
  status: "paid",
  paid_on: "2026-10-02",
  due_on: null,
  method: null,
  note: null,
  created_at: "2026-10-02T00:00:00Z",
  ...o,
});

describe("spendByMonth", () => {
  it("counts only paid money, by month, split gym / PT", () => {
    const rows = spendByMonth(
      [membership({}), membership({ id: "m2", payment_status: "pending", start_date: "2026-12-29" })],
      [payment({}), payment({ id: "p2", status: "pending", paid_on: null }), payment({ id: "p3", kind: "refund", amount_paise: 100000, paid_on: "2026-10-20" })],
    );
    expect(rows).toEqual([
      { month: "2026-09", gym: 500000, pt: 0, total: 500000 },
      { month: "2026-10", gym: 0, pt: 500000, total: 500000 },
    ]);
  });

  it("uses the payment date for a membership when there is one", () => {
    expect(spendByMonth([membership({ paid_on: "2026-10-05" })], [])).toEqual([{ month: "2026-10", gym: 500000, pt: 0, total: 500000 }]);
  });

  it("is empty when nothing is paid", () => {
    expect(spendByMonth([membership({ payment_status: "unconfirmed" })], [payment({ status: "pending" })])).toEqual([]);
  });
});
