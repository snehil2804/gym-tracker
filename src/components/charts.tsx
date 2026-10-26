"use client";

import { useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cx } from "@/components/ui";

const axis = { stroke: "var(--faint)", fontSize: 11, tickLine: false, axisLine: false } as const;

/** Chart frame: title, optional legend, chart, and a table view so values are never colour- or hover-only. */
export function ChartCard({
  title,
  subtitle,
  legend,
  table,
  children,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  legend?: { label: string; color: string; hatch?: boolean }[];
  table?: { columns: string[]; rows: (string | number)[][] };
  children: ReactNode;
  className?: string;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <figure className={cx("rounded-2xl border border-line bg-surface p-5 shadow-card", className)}>
      <figcaption className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[15px] font-semibold text-ink">{title}</p>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
        {legend && legend.length > 1 && (
          <ul className="flex flex-wrap gap-3 text-xs text-ink-2">
            {legend.map((l) => (
              <li key={l.label} className="flex items-center gap-1.5">
                <span className={cx("size-2.5 rounded-[3px]", l.hatch && "hatch")} style={{ background: l.hatch ? undefined : l.color, backgroundColor: l.color }} />
                {l.label}
              </li>
            ))}
          </ul>
        )}
      </figcaption>
      {showTable && table ? (
        <div className="max-h-64 overflow-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-2 text-left text-xs text-muted">
              <tr>
                {table.columns.map((c) => (
                  <th key={c} className="px-3 py-2 font-semibold">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="num divide-y divide-line">
              {table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((v, j) => (
                    <td key={j} className="px-3 py-1.5">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-56 w-full">{children}</div>
      )}
      {table && (
        <button className="mt-2 text-xs font-medium text-muted underline-offset-2 hover:text-ink hover:underline" onClick={() => setShowTable((s) => !s)}>
          {showTable ? "Show chart" : "Show as table"}
        </button>
      )}
    </figure>
  );
}

interface TipProps {
  active?: boolean;
  payload?: readonly { dataKey?: unknown; name?: unknown; value?: unknown; color?: string }[];
  label?: unknown;
  format?: (v: number, name: string) => string;
  labelFormat?: (l: string) => string;
}

function TipBox({ active, payload, label, format, labelFormat }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-pop">
      <p className="mb-1 font-semibold text-ink">{labelFormat ? labelFormat(String(label)) : String(label)}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center gap-2 text-ink-2">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          {String(p.name)}: <span className="num font-semibold text-ink">{format ? format(Number(p.value), String(p.name)) : String(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

export interface BarSpec {
  key: string;
  name: string;
  color: string;
  hatch?: boolean;
}

export function Bars({
  data,
  x,
  bars,
  stacked,
  format,
  xFormat,
  labelFormat,
  allowDecimals = false,
}: {
  data: object[];
  x: string;
  bars: BarSpec[];
  stacked?: boolean;
  format?: (v: number, name: string) => string;
  xFormat?: (v: string) => string;
  labelFormat?: (v: string) => string;
  allowDecimals?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -18 }} barGap={2}>
        <defs>
          <pattern id="hatch-loss" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--chart-loss)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--surface)" strokeWidth="1.5" strokeOpacity="0.55" />
          </pattern>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
        <XAxis dataKey={x} {...axis} tickFormatter={xFormat} interval="preserveStartEnd" minTickGap={12} />
        <YAxis {...axis} allowDecimals={allowDecimals} tickFormatter={format ? (v: number) => format(v, "") : undefined} width={52} />
        <Tooltip cursor={{ fill: "var(--surface-2)" }} content={(p) => <TipBox active={p.active} payload={p.payload} label={p.label} format={format} labelFormat={labelFormat ?? xFormat} />} />
        {bars.map((b, i) => (
          <Bar
            key={b.key}
            dataKey={b.key}
            name={b.name}
            fill={b.hatch ? "url(#hatch-loss)" : b.color}
            stackId={stacked ? "s" : undefined}
            maxBarSize={24}
            radius={stacked ? (i === bars.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]) : [4, 4, 0, 0]}
            stroke="var(--surface)"
            strokeWidth={stacked ? 2 : 0}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Lines({
  data,
  x,
  lines,
  format,
  xFormat,
  domain,
}: {
  data: object[];
  x: string;
  lines: { key: string; name: string; color: string; dashed?: boolean }[];
  format?: (v: number, name: string) => string;
  xFormat?: (v: string) => string;
  domain?: [number | "auto" | "dataMin", number | "auto" | "dataMax"];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
        <XAxis dataKey={x} {...axis} tickFormatter={xFormat} interval="preserveStartEnd" minTickGap={16} />
        <YAxis {...axis} domain={domain ?? ["auto", "auto"]} tickFormatter={format ? (v: number) => format(v, "") : undefined} width={52} />
        <Tooltip cursor={{ stroke: "var(--line-strong)", strokeWidth: 1 }} content={(p) => <TipBox active={p.active} payload={p.payload} label={p.label} format={format} labelFormat={xFormat} />} />
        {lines.map((l) => (
          <Line
            key={l.key}
            type="monotone"
            dataKey={l.key}
            name={l.name}
            stroke={l.color}
            strokeWidth={2}
            strokeDasharray={l.dashed ? "4 4" : undefined}
            strokeLinecap="round"
            dot={{ r: 4, fill: l.color, stroke: "var(--surface)", strokeWidth: 2 }}
            activeDot={{ r: 6, stroke: "var(--surface)", strokeWidth: 2 }}
            connectNulls
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Horizontal HTML bars for ranked categories (labels stay readable on phones). */
export function RankBars({ items, format }: { items: { label: string; value: number }[]; format?: (v: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.label} className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-2 text-sm">
          <span className="truncate text-ink-2 capitalize">{i.label}</span>
          <span className="h-3 overflow-hidden rounded-r-[4px] bg-surface-2">
            <span className="block h-full rounded-r-[4px]" style={{ width: `${(i.value / max) * 100}%`, background: "var(--chart-ink)" }} />
          </span>
          <span className="num text-right font-semibold text-ink">{format ? format(i.value) : i.value}</span>
        </li>
      ))}
    </ul>
  );
}
