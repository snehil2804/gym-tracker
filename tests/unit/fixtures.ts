import type { Attendance, LedgerEntry, PackageSummary, Payment } from "@/lib/types";

let n = 0;
const id = (p: string) => `${p}-${++n}`;

export function pkg(over: Partial<PackageSummary> = {}): PackageSummary {
  return {
    id: id("pkg"), trainer_id: "t1", trainer_name: "Soham", label: null,
    price_paise: 600000, sessions_purchased: 30, purchased_on: null, start_date: "2026-09-29", expiry_date: null,
    schedule_days: [1, 2, 3, 4, 5, 6], exclude_sundays: true, sessions_per_week: 6, rollover_allowed: false,
    pausable: false, extension_allowed: false, status: "active", closed_on: null, unused_sessions_treatment: "undecided",
    renewed_from_id: null, notes: null, created_at: "2026-09-29T00:00:00Z",
    completed: 0, forfeited: 0, credited: 0, refunded: 0, expired: 0, transferred_in: 0, transferred_out: 0, adjusted: 0,
    remaining: 30, last_session_date: null, trainer_cancelled: 0, client_cancelled: 0, rescheduled: 0, missed_unconfirmed: 0,
    paid_paise: 0, refunded_paise: 0, pending_paise: 0, outstanding_paise: 600000,
    ...over,
  };
}

export function att(date: string, over: Partial<Attendance> = {}): Attendance {
  return {
    id: id("att"), date, gym_status: "unverified", pt_status: "unverified", pt_package_id: null, rescheduled_to: null,
    absence_reason: null, notes: null, source: "manual", created_at: "", updated_at: "", ...over,
  };
}

export function led(package_id: string, kind: LedgerEntry["kind"], session_date: string | null, over: Partial<LedgerEntry> = {}): LedgerEntry {
  const sessions = kind === "credit" || kind === "transfer_in" ? 1 : -1;
  return {
    id: id("led"), package_id, kind, sessions, session_date, attendance_id: null, note: null, voided_at: null,
    void_reason: null, created_at: "", ...over,
  };
}

export function pay(package_id: string, amount_paise: number, over: Partial<Payment> = {}): Payment {
  return {
    id: id("pay"), package_id, kind: "payment", amount_paise, status: "paid", paid_on: "2026-09-29", due_on: null,
    method: null, note: null, created_at: "", ...over,
  };
}

/** The ten confirmed gym absences from the initial data, exactly as the database seeds them. */
export const SEEDED_ABSENCES = [
  "2026-10-01", "2026-10-03", "2026-10-11", "2026-10-12", "2026-10-13",
  "2026-10-15", "2026-10-17", "2026-10-19", "2026-10-23", "2026-10-24",
];
export function seededAttendance(): Attendance[] {
  return SEEDED_ABSENCES.map((d) =>
    att(d, { gym_status: "absent", pt_status: d === "2026-10-11" ? "not_scheduled" : "unverified", source: "seed" }),
  );
}
