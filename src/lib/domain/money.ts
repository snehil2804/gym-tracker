// All money is integer paise (1 rupee = 100 paise). No floating-point arithmetic
// touches stored amounts; division happens once, at the end, with explicit rounding.

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string, fractionDigits: number) {
  const key = `${currency}:${fractionDigits}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    formatters.set(key, f);
  }
  return f;
}

/** ₹6,000 · ₹12,500 · ₹1,23,456 · ₹333.33 (paise shown only when non-zero). */
export function formatMoney(paise: number, currency = "INR"): string {
  const whole = paise % 100 === 0;
  return formatter(currency, whole ? 0 : 2).format(paise / 100);
}

/** Compact for tight spaces: ₹6k, ₹1.2L */
export function formatMoneyCompact(paise: number, currency = "INR"): string {
  const rupees = paise / 100;
  if (currency === "INR") {
    if (Math.abs(rupees) >= 100000) return `₹${trim(rupees / 100000)}L`;
    if (Math.abs(rupees) >= 1000) return `₹${trim(rupees / 1000)}k`;
  }
  return formatMoney(Math.round(paise / 100) * 100, currency);
}

function trim(n: number) {
  return (Math.round(n * 10) / 10).toString();
}

/**
 * Parses user input such as "6000", "6,000", "₹ 6,000.50" into paise without
 * floating point. Returns null for anything that is not a valid non-negative amount.
 */
export function parseMoneyToPaise(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, "").replace(/^rs\.?/i, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [rupees, frac = ""] = cleaned.split(".");
  const paise = Number(rupees) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(paise) ? paise : null;
}

export function paiseToInput(paise: number): string {
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2);
}

/** Exact per-session rate as a fraction; use sessionValue() for amounts. */
export function costPerSession(pricePaise: number, sessions: number): number {
  if (sessions <= 0) return 0;
  return Math.round(pricePaise / sessions);
}

/**
 * Allocated value of `count` sessions of a package. Computed as
 * round(count × price / sessions) so that, e.g., 30 sessions of ₹10,000
 * always total exactly ₹10,000 even though one session is ₹333.33.
 */
export function sessionValue(count: number, pricePaise: number, sessionsPurchased: number): number {
  if (sessionsPurchased <= 0 || count === 0) return 0;
  return Math.round((count * pricePaise) / sessionsPurchased);
}
