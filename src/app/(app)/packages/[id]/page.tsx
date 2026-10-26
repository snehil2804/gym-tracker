"use client";

import { ArrowLeft, Ban, CirclePlus, Lock, Pencil, RefreshCw, Trash2, Wallet } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { DayBadge } from "@/components/day-status";
import { AdjustSheet, ClosePackageSheet, EditPackageSheet, PaymentSheet } from "@/components/package-sheets";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmSheet,
  EmptyState,
  ErrorNote,
  Estimate,
  Field,
  Input,
  KeyValue,
  LinkButton,
  ProgressBar,
  Sheet,
  Skeleton,
  Stat,
  useToast,
  cx,
} from "@/components/ui";
import { useCore, type Core } from "@/lib/data/derived";
import { useDeletePackage, useDeletePayment, useVoidAdjustment } from "@/lib/data/hooks";
import { classifyDay } from "@/lib/domain/attendance";
import { addDays, formatDate, formatShort, relativeDay, weekdayLabel } from "@/lib/domain/dates";
import { forecastPackage, upcomingSessionDates } from "@/lib/domain/forecast";
import { formatMoney, sessionValue } from "@/lib/domain/money";
import { LEDGER_LABEL, packageState, packageTotal, TREATMENT_LABEL } from "@/lib/domain/packages";
import type { LedgerEntry, PackageSummary, Payment } from "@/lib/types";

export default function PackagePage() {
  const { id } = useParams<{ id: string }>();
  const { data: d, loading, error } = useCore();
  if (error) return <ErrorNote error={error} />;
  if (loading || !d) return <Skeleton className="h-96" />;
  const pkg = d.packages.find((p) => p.id === id);
  if (!pkg)
    return (
      <Card>
        <EmptyState title="Package not found" action={<LinkButton href="/packages">All packages</LinkButton>}>
          It may have been deleted, or it belongs to another account.
        </EmptyState>
      </Card>
    );
  return <PackageDetail d={d} pkg={pkg} />;
}

function PackageDetail({ d, pkg }: { d: Core; pkg: PackageSummary }) {
  const router = useRouter();
  const toast = useToast();
  const [sheet, setSheet] = useState<null | "pay" | "adjust" | "edit" | "close" | "delete">(null);
  const [editPayment, setEditPayment] = useState<Payment | undefined>();
  const [voiding, setVoiding] = useState<LedgerEntry | null>(null);
  const [deletePay, setDeletePay] = useState<Payment | null>(null);
  const delPkg = useDeletePackage();
  const delPayment = useDeletePayment();

  const st = packageState(pkg, d.today);
  const total = packageTotal(pkg);
  const rate = sessionValue(1, pkg.price_paise, pkg.sessions_purchased);
  const val = (n: number) => formatMoney(sessionValue(n, pkg.price_paise, pkg.sessions_purchased));
  const payments = d.payments.filter((p) => p.package_id === pkg.id);
  const ledger = d.ledger.filter((l) => l.package_id === pkg.id).sort((a, b) => ((a.session_date ?? a.created_at) < (b.session_date ?? b.created_at) ? 1 : -1));
  const attendance = d.attendance.filter((a) => a.pt_package_id === pkg.id);
  const usedAny = pkg.completed + pkg.forfeited > 0;
  const todayRec = d.byDate.get(d.today);
  const from = todayRec && ["completed", "chargeable_absence", "trainer_cancelled", "rescheduled", "not_scheduled"].includes(todayRec.pt_status) ? addDays(d.today, 1) : d.today;
  const forecast =
    pkg.status === "active"
      ? forecastPackage({
          from,
          remaining: pkg.remaining,
          scheduleDays: pkg.schedule_days,
          blocks: d.blocks,
          packageId: pkg.id,
          packageStart: pkg.start_date,
          expiry: pkg.expiry_date,
        })
      : null;
  const nextDates =
    pkg.status === "active" && pkg.remaining > 0
      ? upcomingSessionDates(pkg.start_date > from ? pkg.start_date : from, Math.min(pkg.remaining, 6), pkg.schedule_days, d.blocks, pkg.id)
      : [];
  const predecessor = pkg.renewed_from_id ? d.packages.find((p) => p.id === pkg.renewed_from_id) : undefined;
  const successor = d.packages.find((p) => p.renewed_from_id === pkg.id);

  return (
    <div className="anim-rise space-y-4">
      <Link href="/packages" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> PT Packages
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-[28px] font-semibold tracking-tight">{pkg.trainer_name}</h1>
            <Badge tone={st.tone}>{st.label}</Badge>
          </div>
          <p className="text-sm text-muted">
            {pkg.label ? `${pkg.label} · ` : ""}
            {formatDate(pkg.start_date)}
            {pkg.closed_on ? ` – closed ${formatDate(pkg.closed_on)}` : ""}
            {pkg.expiry_date ? ` · expires ${formatDate(pkg.expiry_date)}` : " · no expiry"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={<Pencil className="size-4" />} onClick={() => setSheet("edit")}>
            Edit
          </Button>
          {pkg.status === "active" && (
            <Button icon={<Lock className="size-4" />} onClick={() => setSheet("close")}>
              Close
            </Button>
          )}
          <LinkButton href={`/packages/new?renew=${pkg.id}`} variant="primary" icon={<RefreshCw className="size-4" />}>
            Renew PT package
          </LinkButton>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <p className="num font-display text-[44px] leading-none font-semibold">
            {pkg.remaining}
            <span className="ml-2 text-base font-medium text-muted">of {total} sessions left</span>
          </p>
          <ProgressBar
            className="mt-4"
            total={total}
            segments={[
              { value: pkg.completed, className: "bg-good", label: "Completed" },
              { value: pkg.forfeited, className: "bg-accent", label: "Missed (charged)" },
              { value: pkg.expired, className: "bg-accent/60", label: "Forfeited at closure" },
              { value: pkg.refunded + pkg.transferred_out, className: "bg-info", label: "Refunded / rolled over" },
            ]}
          />
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Completed" value={pkg.completed} hint={val(pkg.completed)} tone="good" />
            <Stat label="Missed · charged" value={pkg.forfeited} hint={val(pkg.forfeited)} tone={pkg.forfeited ? "accent" : undefined} />
            <Stat label="Trainer cancelled" value={pkg.trainer_cancelled} hint="not deducted" />
            <Stat label="Rescheduled" value={pkg.rescheduled} hint="counted once" />
          </div>
          {(pkg.credited || pkg.refunded || pkg.expired || pkg.transferred_in || pkg.transferred_out || pkg.adjusted || pkg.missed_unconfirmed) > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4 text-xs">
              {pkg.credited > 0 && <Badge tone="good">+{pkg.credited} credited</Badge>}
              {pkg.transferred_in > 0 && <Badge tone="info">+{pkg.transferred_in} rolled in</Badge>}
              {pkg.refunded > 0 && <Badge tone="info">−{pkg.refunded} refunded</Badge>}
              {pkg.transferred_out > 0 && <Badge tone="info">−{pkg.transferred_out} rolled out</Badge>}
              {pkg.expired > 0 && <Badge tone="loss">−{pkg.expired} forfeited at closure</Badge>}
              {pkg.adjusted !== 0 && <Badge tone="warn">{pkg.adjusted > 0 ? "+" : ""}{pkg.adjusted} adjusted</Badge>}
              {pkg.missed_unconfirmed > 0 && <Badge tone="warn">{pkg.missed_unconfirmed} misses awaiting confirmation</Badge>}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-[13px] font-semibold tracking-[0.06em] text-muted uppercase">Money</h2>
          <KeyValue
            className="mt-2"
            items={[
              { k: "Package price", v: formatMoney(pkg.price_paise) },
              { k: "Sessions bought", v: pkg.sessions_purchased },
              { k: "Cost per session", v: formatMoney(rate) },
              { k: "Paid", v: formatMoney(pkg.paid_paise) },
              { k: "Not yet paid", v: <span className={pkg.outstanding_paise ? "text-warn" : ""}>{formatMoney(pkg.outstanding_paise)}</span> },
              ...(pkg.refunded_paise ? [{ k: "Refunds received", v: formatMoney(pkg.refunded_paise) }] : []),
              { k: "Prepaid value left", v: val(Math.max(pkg.remaining, 0)) },
            ]}
          />
          <Button block className="mt-3" icon={<Wallet className="size-4" />} onClick={() => (setEditPayment(undefined), setSheet("pay"))}>
            Record payment
          </Button>
        </Card>
      </div>

      {pkg.status === "active" && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold">
              Schedule & forecast <Estimate />
            </h2>
            <p className="text-sm text-muted">
              {pkg.schedule_days.map((w) => weekdayLabel(w)).join(" · ")}
              {pkg.exclude_sundays ? " · Sundays excluded" : ""}
            </p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Next session" value={forecast?.nextSession && pkg.remaining > 0 ? relativeDay(forecast.nextSession, d.today) : "—"} hint={forecast?.nextSession ? formatShort(forecast.nextSession) : undefined} />
            <Stat label="Estimated last session" value={forecast?.finalDate ? formatDate(forecast.finalDate) : "—"} hint="if every planned session happens" />
            <Stat
              label="Sessions possible before expiry"
              value={forecast?.opportunitiesBeforeExpiry ?? "No expiry"}
              hint={forecast?.runsPastExpiry ? <span className="text-accent">{forecast.unusedAtExpiry} would be left unused</span> : undefined}
            />
            <Stat label="Planned per week" value={pkg.schedule_days.length} hint="sessions" />
          </div>
          {nextDates.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {nextDates.map((dt) => (
                <span key={dt} className="rounded-lg bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-2">
                  {formatShort(dt)}
                </span>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-muted">
            Estimates skip planned breaks (vacations, pauses, holidays) from Settings and never assume you will attend. They change as you log days.
          </p>
        </Card>
      )}

      {(predecessor || successor) && (
        <Card className="flex flex-wrap gap-4 p-4 text-sm">
          {predecessor && (
            <Link href={`/packages/${predecessor.id}`} className="text-muted hover:text-ink">
              ← Renewed from package starting {formatDate(predecessor.start_date)} ({TREATMENT_LABEL[predecessor.unused_sessions_treatment].toLowerCase()} unused)
            </Link>
          )}
          {successor && (
            <Link href={`/packages/${successor.id}`} className="text-muted hover:text-ink">
              Renewed as package starting {formatDate(successor.start_date)} →
            </Link>
          )}
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Payments"
            action={
              <Button size="sm" variant="ghost" icon={<CirclePlus className="size-4" />} onClick={() => (setEditPayment(undefined), setSheet("pay"))}>
                Add
              </Button>
            }
          />
          {payments.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted">No payments recorded. Until you add one, this package counts as {formatMoney(pkg.price_paise)} not yet paid — never as money spent.</p>
          ) : (
            <ul className="divide-y divide-line px-5 pb-2">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="num text-sm font-semibold">
                      {p.kind === "refund" ? "Refund " : ""}
                      {formatMoney(p.amount_paise)}{" "}
                      <Badge tone={p.status === "paid" ? (p.kind === "refund" ? "info" : "good") : "warn"}>{p.kind === "refund" ? "received" : p.status}</Badge>
                    </p>
                    <p className="text-xs text-muted">
                      {p.status === "paid" ? formatDate(p.paid_on) : p.due_on ? `due ${formatDate(p.due_on)}` : "no due date"}
                      {p.method ? ` · ${p.method}` : ""}
                      {p.note ? ` · ${p.note}` : ""}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => (setEditPayment(p), setSheet("pay"))} aria-label="Edit payment">
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeletePay(p)} aria-label="Delete payment">
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Session ledger"
            action={
              <Button size="sm" variant="ghost" icon={<CirclePlus className="size-4" />} onClick={() => setSheet("adjust")}>
                Adjust
              </Button>
            }
          />
          <p className="px-5 pt-1 text-xs text-muted">
            Balance = {pkg.sessions_purchased} purchased {ledger.filter((l) => !l.voided_at).length ? "± the entries below" : ""}. Completed and missed entries come from attendance; corrections void entries instead of deleting them.
          </p>
          {ledger.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted">No sessions recorded against this package yet.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-line overflow-y-auto px-5 pb-2">
              {ledger.map((l) => (
                <li key={l.id} className={cx("flex items-center gap-3 py-2.5", l.voided_at && "opacity-50")}>
                  <span
                    className={cx(
                      "num w-10 shrink-0 text-right text-sm font-semibold",
                      l.voided_at ? "line-through" : l.sessions > 0 ? "text-good" : l.kind === "forfeited" || l.kind === "expired" ? "text-accent" : "text-ink",
                    )}
                  >
                    {l.sessions > 0 ? "+" : "−"}
                    {Math.abs(l.sessions)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cx("text-sm font-medium", l.voided_at && "line-through")}>{LEDGER_LABEL[l.kind]}</p>
                    <p className="truncate text-xs text-muted">
                      {l.session_date ? formatShort(l.session_date) : formatDate(l.created_at.slice(0, 10))}
                      {l.note && !["PT session completed", "Confirmed chargeable PT absence"].includes(l.note) ? ` · ${l.note}` : ""}
                      {l.voided_at ? ` · voided: ${l.void_reason}` : ""}
                    </p>
                  </div>
                  {!l.voided_at && !["completed", "forfeited"].includes(l.kind) && (
                    <Button size="sm" variant="ghost" onClick={() => setVoiding(l)} aria-label="Void entry">
                      <Ban className="size-3.5" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Attendance on this package" />
        {attendance.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">No PT days linked yet. Days appear here once their PT outcome is confirmed.</p>
        ) : (
          <ul className="grid gap-x-6 px-5 pb-3 sm:grid-cols-2">
            {attendance.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 border-b border-line py-2 text-sm">
                <Link href={`/calendar?d=${a.date}`} className="hover:underline">
                  {formatShort(a.date)}
                </Link>
                <DayBadge kind={classifyDay(a.date, a, d.dayCtx)} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {pkg.notes && (
        <Card className="p-5 text-sm text-ink-2">
          <p className="mb-1 text-[13px] font-semibold text-muted">Notes</p>
          {pkg.notes}
        </Card>
      )}

      {!usedAny && payments.length === 0 && (
        <div className="pt-2">
          <Button variant="danger" size="sm" icon={<Trash2 className="size-4" />} onClick={() => setSheet("delete")}>
            Delete package
          </Button>
        </div>
      )}

      {sheet === "pay" && <PaymentSheet pkg={pkg} payment={editPayment} today={d.today} onClose={() => setSheet(null)} />}
      {sheet === "adjust" && <AdjustSheet pkg={pkg} today={d.today} onClose={() => setSheet(null)} />}
      {sheet === "edit" && <EditPackageSheet pkg={pkg} onClose={() => setSheet(null)} />}
      {sheet === "close" && <ClosePackageSheet pkg={pkg} packages={d.packages} today={d.today} onClose={() => setSheet(null)} />}
      <ConfirmSheet
        open={sheet === "delete"}
        onClose={() => setSheet(null)}
        title="Delete this package?"
        loading={delPkg.isPending}
        onConfirm={async () => {
          try {
            await delPkg.mutateAsync(pkg.id);
            toast.success("Package deleted.");
            router.push("/packages");
          } catch (e) {
            toast.error(e);
          }
        }}
      >
        Only possible because no sessions or payments are recorded on it. The deletion is kept in the audit log.
      </ConfirmSheet>
      <ConfirmSheet
        open={!!deletePay}
        onClose={() => setDeletePay(null)}
        title="Delete this payment?"
        loading={delPayment.isPending}
        onConfirm={async () => {
          try {
            await delPayment.mutateAsync(deletePay!.id);
            toast.success("Payment deleted.");
            setDeletePay(null);
          } catch (e) {
            toast.error(e);
          }
        }}
      >
        {deletePay && `${formatMoney(deletePay.amount_paise)} (${deletePay.status}). The change is kept in the audit log.`}
      </ConfirmSheet>
      {voiding && <VoidSheet entry={voiding} onClose={() => setVoiding(null)} />}
    </div>
  );
}

function VoidSheet({ entry, onClose }: { entry: LedgerEntry; onClose: () => void }) {
  const toast = useToast();
  const voidIt = useVoidAdjustment();
  const [reason, setReason] = useState("");
  return (
    <Sheet
      open
      onClose={onClose}
      title="Void this entry?"
      description={`${LEDGER_LABEL[entry.kind]} (${entry.sessions > 0 ? "+" : ""}${entry.sessions}). It stays in history, crossed out.`}
      footer={
        <Button
          variant="accent"
          block
          disabled={!reason.trim()}
          loading={voidIt.isPending}
          onClick={async () => {
            try {
              await voidIt.mutateAsync({ id: entry.id, reason });
              toast.success("Entry voided.");
              onClose();
            } catch (e) {
              toast.error(e);
            }
          }}
        >
          Void entry
        </Button>
      }
    >
      <Field label="Reason">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} data-autofocus />
      </Field>
    </Sheet>
  );
}
