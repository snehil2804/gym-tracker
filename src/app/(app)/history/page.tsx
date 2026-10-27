"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DayBadge } from "@/components/day-status";
import { Badge, Card, ErrorNote, Field, Input, PageHeader, Segmented, Select, Skeleton, cx } from "@/components/ui";
import { useCore, type Core } from "@/lib/data/derived";
import { useAudit } from "@/lib/data/hooks";
import { ABSENCE_REASONS, classifyDay } from "@/lib/domain/attendance";
import { formatDate, formatShort } from "@/lib/domain/dates";
import { formatMoney } from "@/lib/domain/money";
import { LEDGER_LABEL } from "@/lib/domain/packages";
import type { AuditEntry } from "@/lib/types";

type Tab = "attendance" | "sessions" | "payments" | "workouts" | "changes";

export default function HistoryPage() {
  const { data: d, loading, error } = useCore();
  if (error) return <ErrorNote error={error} />;
  if (loading || !d) return <Skeleton className="h-96" />;
  return <History d={d} />;
}

const TABLE_LABEL: Record<string, string> = {
  attendance: "Attendance",
  pt_ledger: "Session ledger",
  pt_packages: "PT package",
  pt_payments: "Payment",
  memberships: "Membership",
  workouts: "Workout",
  trainers: "Trainer",
  schedule_blocks: "Planned break",
  profiles: "Settings",
  goals: "Goal",
};
const HIDDEN_FIELDS = new Set(["updated_at", "created_at", "user_id", "id"]);

function describeAudit(a: AuditEntry): string {
  const n = a.new_data ?? {};
  const o = a.old_data ?? {};
  if (a.table_name === "attendance") {
    const date = String(n.date ?? o.date);
    if (a.action === "insert") return `${formatShort(date)}: gym ${n.gym_status}, PT ${n.pt_status}`;
    if (a.action === "delete") return `${formatShort(date)}: record cleared`;
  }
  if (a.table_name === "pt_ledger") {
    const label = LEDGER_LABEL[String(n.kind ?? o.kind)] ?? "Entry";
    if (a.action === "insert") return `${label} ${Number(n.sessions) > 0 ? "+" : ""}${n.sessions}${n.session_date ? ` on ${formatShort(String(n.session_date))}` : ""}`;
    if (n.voided_at && !o.voided_at) return `${label} voided — ${n.void_reason}`;
  }
  if (a.table_name === "pt_payments" && a.action === "insert") return `${n.kind === "refund" ? "Refund" : "Payment"} ${formatMoney(Number(n.amount_paise))} (${n.status})`;
  if (a.table_name === "pt_packages" && a.action === "insert") return `Package created: ${formatMoney(Number(n.price_paise))} for ${n.sessions_purchased} sessions from ${formatDate(String(n.start_date))}`;
  if (a.action === "insert") return "Created";
  if (a.action === "delete") return "Deleted";
  return (a.changed ?? [])
    .filter((c) => !HIDDEN_FIELDS.has(c))
    .map((c) => {
      const fmt = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : c.endsWith("_paise") ? formatMoney(Number(v)) : typeof v === "object" ? JSON.stringify(v) : String(v));
      return `${c.replace(/_/g, " ")}: ${fmt(o[c])} → ${fmt(n[c])}`;
    })
    .join("; ");
}

function History({ d }: { d: Core }) {
  const [tab, setTab] = useState<Tab>("attendance");
  const [from, setFrom] = useState(d.trackingStart ?? "");
  const [to, setTo] = useState(d.today);
  const [pkg, setPkg] = useState("");
  const [trainer, setTrainer] = useState("");
  const [type, setType] = useState("");
  const audit = useAudit(1000);
  const inRange = (date: string | null | undefined) => !date || ((!from || date >= from) && (!to || date <= to));
  const trainers = [...new Map(d.packages.map((p) => [p.trainer_id, p.trainer_name])).entries()];
  const pkgOk = (id: string | null) => (!pkg || id === pkg) && (!trainer || d.packages.find((p) => p.id === id)?.trainer_id === trainer);

  const attendance = useMemo(
    () => d.attendance.filter((a) => inRange(a.date) && (!pkg && !trainer ? true : pkgOk(a.pt_package_id)) && (!type || a.pt_status === type || a.gym_status === type)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [d.attendance, from, to, pkg, trainer, type],
  );
  const ledger = d.ledger.filter((l) => inRange(l.session_date ?? l.created_at.slice(0, 10)) && pkgOk(l.package_id) && (!type || l.kind === type));
  const payments = d.payments.filter((p) => inRange(p.paid_on ?? p.due_on ?? p.created_at.slice(0, 10)) && pkgOk(p.package_id) && (!type || p.kind === type || p.status === type));
  const workouts = d.workouts.filter((w) => inRange(w.workout_date));
  const changes = (audit.data ?? []).filter((a) => inRange(a.created_at.slice(0, 10)) && (!type || a.table_name === type));

  const typeOptions: Record<Tab, [string, string][]> = {
    attendance: [
      ["completed", "PT completed"],
      ["chargeable_absence", "PT missed (charged)"],
      ["missed_unconfirmed", "PT missed (unconfirmed)"],
      ["trainer_cancelled", "Trainer cancelled"],
      ["client_cancelled", "I cancelled"],
      ["rescheduled", "Rescheduled"],
      ["absent", "Gym missed"],
      ["attended", "Gym attended"],
      ["rest", "Rest day"],
    ],
    sessions: Object.entries(LEDGER_LABEL),
    payments: [
      ["payment", "Payments"],
      ["refund", "Refunds"],
      ["pending", "Pending"],
      ["paid", "Paid"],
    ],
    workouts: [],
    changes: Object.entries(TABLE_LABEL),
  };

  return (
    <div className="anim-rise">
      <PageHeader title="History" subtitle="Everything you've recorded, and every change made to it." />
      <div className="-mx-1 mb-4 no-scrollbar overflow-x-auto px-1">
        <Segmented
          className="min-w-max"
          value={tab}
          onChange={(t) => {
            setTab(t);
            setType("");
          }}
          options={[
            { value: "attendance", label: "Attendance" },
            ...(d.ptEnabled ? [{ value: "sessions" as const, label: "Sessions" }] : []),
            { value: "payments", label: "Payments" },
            { value: "workouts", label: "Workouts" },
            { value: "changes", label: "Changes" },
          ]}
        />
      </div>

      <Card glow="teal" className="mb-4 grid grid-cols-2 gap-3 p-4 sm:grid-cols-5">
        <Field label="From">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Trainer">
          <Select value={trainer} onChange={(e) => setTrainer(e.target.value)}>
            <option value="">All</option>
            {trainers.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Package">
          <Select value={pkg} onChange={(e) => setPkg(e.target.value)}>
            <option value="">All</option>
            {d.packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.trainer_name} · {formatDate(p.start_date)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value)} disabled={typeOptions[tab].length === 0}>
            <option value="">All</option>
            {typeOptions[tab].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
      </Card>

      <Card className="divide-y divide-line">
        {tab === "attendance" &&
          (attendance.length ? (
            attendance.map((a) => (
              <Link key={a.id} href={`/calendar?d=${a.date}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-2/50">
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{formatShort(a.date)} {a.date.slice(0, 4)}</span>
                  <span className="block truncate text-xs text-muted">
                    {a.absence_reason ? `${ABSENCE_REASONS.find((r) => r.value === a.absence_reason)?.label} · ` : ""}
                    {a.rescheduled_to ? `moved to ${formatShort(a.rescheduled_to)} · ` : ""}
                    {a.notes ?? ""}
                  </span>
                </span>
                <DayBadge kind={classifyDay(a.date, a, d.dayCtx)} />
              </Link>
            ))
          ) : (
            <Empty />
          ))}
        {tab === "sessions" &&
          (ledger.length ? (
            ledger.map((l) => {
              const p = d.packages.find((x) => x.id === l.package_id);
              return (
                <div key={l.id} className={cx("flex items-center gap-3 px-5 py-3", l.voided_at && "opacity-55")}>
                  <span className={cx("num w-10 text-right text-sm font-semibold", l.voided_at && "line-through", l.sessions > 0 ? "text-good" : l.kind === "forfeited" ? "text-accent" : "")}>
                    {l.sessions > 0 ? "+" : "−"}
                    {Math.abs(l.sessions)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cx("block text-sm font-medium", l.voided_at && "line-through")}>{LEDGER_LABEL[l.kind]}</span>
                    <span className="block truncate text-xs text-muted">
                      {l.session_date ? formatShort(l.session_date) : formatDate(l.created_at.slice(0, 10))} · {p?.trainer_name}
                      {l.voided_at ? ` · voided ${formatDate(l.voided_at.slice(0, 10))}: ${l.void_reason}` : ""}
                    </span>
                  </span>
                </div>
              );
            })
          ) : (
            <Empty />
          ))}
        {tab === "payments" &&
          (payments.length ? (
            payments.map((p) => (
              <Link key={p.id} href={`/packages/${p.package_id}`} className="flex items-center justify-between px-5 py-3 text-sm hover:bg-surface-2/50">
                <span>
                  <span className="block font-medium">
                    {p.kind === "refund" ? "Refund" : "Payment"} · {d.packages.find((x) => x.id === p.package_id)?.trainer_name}
                  </span>
                  <span className="text-xs text-muted">{p.paid_on ? formatDate(p.paid_on) : p.due_on ? `due ${formatDate(p.due_on)}` : "pending"}</span>
                </span>
                <span className="num flex items-center gap-2 font-semibold">
                  {formatMoney(p.amount_paise)} <Badge tone={p.status === "paid" ? "good" : "warn"}>{p.status}</Badge>
                </span>
              </Link>
            ))
          ) : (
            <Empty />
          ))}
        {tab === "workouts" &&
          (workouts.length ? (
            workouts.map((w) => (
              <Link key={w.id} href={`/workouts/${w.id}`} className="flex items-center justify-between px-5 py-3 text-sm hover:bg-surface-2/50">
                <span className="font-medium">{w.title || w.muscle_groups.join(", ") || "Workout"}</span>
                <span className="text-xs text-muted">
                  {formatShort(w.workout_date)} · {w.exercises.length} exercises
                </span>
              </Link>
            ))
          ) : (
            <Empty />
          ))}
        {tab === "changes" &&
          (audit.isLoading ? (
            <Skeleton className="m-4 h-40" />
          ) : changes.length ? (
            changes.map((a) => (
              <div key={a.id} className="px-5 py-3 text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <Badge tone={a.action === "delete" ? "loss" : a.action === "insert" ? "good" : "info"}>{a.action === "insert" ? "added" : a.action === "delete" ? "removed" : "changed"}</Badge>
                  <span className="font-medium">{TABLE_LABEL[a.table_name] ?? a.table_name}</span>
                  <span className="text-xs text-muted">{new Date(a.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
                </p>
                <p className="mt-1 text-[13px] break-words text-ink-2">{describeAudit(a)}</p>
              </div>
            ))
          ) : (
            <Empty />
          ))}
      </Card>
    </div>
  );
}

function Empty() {
  return <p className="px-5 py-8 text-center text-sm text-muted">Nothing recorded for these filters.</p>;
}
