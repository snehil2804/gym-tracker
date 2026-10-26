/** RFC 4180 CSV with a header row. Values are never re-formatted, so amounts stay in paise and dates in ISO form. */
export function toCSV<T extends Record<string, unknown>>(rows: T[], columns?: (keyof T & string)[]): string {
  const cols = columns ?? (rows.length ? (Object.keys(rows[0]) as (keyof T & string)[]) : []);
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\r\n");
}
