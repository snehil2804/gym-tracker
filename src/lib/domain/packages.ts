import type { PackageSummary } from "../types";

export function packageState(p: PackageSummary, today: string): { label: string; tone: "good" | "info" | "neutral" | "warn" | "loss" } {
  if (p.status === "cancelled") return { label: "Cancelled", tone: "loss" };
  if (p.status === "completed") return { label: "Completed", tone: "neutral" };
  if (p.status === "closed") return { label: p.unused_sessions_treatment === "still_usable" ? "Closed · usable" : "Closed", tone: "neutral" };
  if (p.start_date > today) return { label: "Upcoming", tone: "info" };
  if (p.expiry_date && p.expiry_date < today && !p.extension_allowed) return { label: "Expired", tone: "warn" };
  if (p.remaining <= 0) return { label: "Used up", tone: "warn" };
  return { label: "Active", tone: "good" };
}

export function packageTotal(p: PackageSummary) {
  return p.sessions_purchased + p.credited + p.transferred_in + p.adjusted;
}

export const TREATMENT_LABEL: Record<PackageSummary["unused_sessions_treatment"], string> = {
  undecided: "Not decided",
  still_usable: "Still usable",
  rolled_over: "Rolled over",
  forfeited: "Forfeited",
  refunded: "Refunded",
};

export const LEDGER_LABEL: Record<string, string> = {
  completed: "Completed session",
  forfeited: "Missed — chargeable",
  credit: "Credit from trainer",
  refund: "Refunded sessions",
  expired: "Forfeited at closure",
  transfer_in: "Rolled over in",
  transfer_out: "Rolled over out",
  adjustment: "Manual adjustment",
};
