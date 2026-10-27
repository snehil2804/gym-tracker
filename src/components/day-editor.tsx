"use client";

import { History as HistoryIcon, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { DayBadge } from "@/components/day-status";
import { Badge, Button, Chip, ConfirmSheet, Field, Input, Segmented, Select, Sheet, Textarea, useToast, cx } from "@/components/ui";
import type { Core } from "@/lib/data/derived";
import { useAudit, useDeleteAttendance, useSaveAttendance } from "@/lib/data/hooks";
import { ABSENCE_REASONS, BLOCK_KIND, blocksOn, classifyDay, GYM_STATUS, isScheduledDay, PT_STATUS, selfCancelledLabel } from "@/lib/domain/attendance";
import { formatDate, formatShort, weekdayName } from "@/lib/domain/dates";
import { formatMoney, sessionValue } from "@/lib/domain/money";
import type { AbsenceReason, GymStatus, PtStatus } from "@/lib/types";

const PT_ORDER: PtStatus[] = ["completed", "chargeable_absence", "missed_unconfirmed", "trainer_cancelled", "client_cancelled", "rescheduled", "not_scheduled"];

export function DayEditor({ d, date, onClose }: { d: Core; date: string; onClose: () => void }) {
  const rec = d.byDate.get(date);
  const toast = useToast();
  const save = useSaveAttendance();
  const del = useDeleteAttendance();
  const audit = useAudit(500);
  const [gym, setGym] = useState<GymStatus>(rec?.gym_status ?? "attended");
  const [pt, setPt] = useState<PtStatus>(rec?.pt_status ?? (d.ptEnabled && isScheduledDay(date, d.scheduleDays) ? "completed" : "not_scheduled"));
  const [pkgId, setPkgId] = useState<string>(rec?.pt_package_id ?? "");
  const [movedTo, setMovedTo] = useState(rec?.rescheduled_to ?? "");
  const [reason, setReason] = useState<AbsenceReason | null>(rec?.absence_reason ?? null);
  const [notes, setNotes] = useState(rec?.notes ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const future = date > d.today;
  const autoPkg = d.activeOn(date);
  const pkg = d.packages.find((p) => p.id === pkgId) ?? autoPkg;
  const rate = pkg ? sessionValue(1, pkg.price_paise, pkg.sessions_purchased) : 0;
  const consumesNow = PT_STATUS[pt].consumes;
  const consumedBefore = rec ? PT_STATUS[rec.pt_status].consumes : false;
  const blocks = blocksOn(date, d.blocks);
  const workouts = d.workouts.filter((w) => w.workout_date === date);

  const history = useMemo(
    () => (rec ? (audit.data ?? []).filter((a) => a.record_id === rec.id) : []),
    [audit.data, rec],
  );

  let impact: string;
  if (consumesNow && !consumedBefore) impact = pkg ? `Uses 1 session from ${pkg.trainer_name}'s package (${formatMoney(rate)} of prepaid value).` : "No package covers this date — saving will fail until you add one.";
  else if (!consumesNow && consumedBefore) impact = "Returns 1 session to the package balance. The earlier entry is kept in history as voided.";
  else if (consumesNow && consumedBefore && rec?.pt_status !== pt) impact = `Swaps the existing entry (still 1 session). ${pt === "chargeable_absence" ? `Counts as ${formatMoney(rate)} of missed value.` : "No longer counts as missed value."}`;
  else if (consumesNow) impact = "Already counted — saving won't deduct again.";
  else impact = "No change to your PT balance.";

  async function submit() {
    try {
      await save.mutateAsync({
        date,
        gym_status: gym,
        pt_status: pt,
        pt_package_id: pkgId || null,
        rescheduled_to: pt === "rescheduled" ? movedTo || null : null,
        absence_reason: gym === "absent" || pt === "chargeable_absence" || pt === "missed_unconfirmed" || pt === "client_cancelled" ? reason : null,
        notes: notes.trim() || null,
      });
      toast.success(`Saved ${formatShort(date)}.`);
      onClose();
    } catch (e) {
      toast.error(e);
    }
  }

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        wide
        title={`${weekdayName(date, true)}, ${formatDate(date)}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <DayBadge kind={classifyDay(date, rec, d.dayCtx)} />
            {d.ptEnabled ? (isScheduledDay(date, d.scheduleDays) ? "Planned PT day" : "No PT planned on this weekday") : null}
          </span>
        }
        footer={
          <div className="flex items-center justify-between gap-2">
            {rec ? (
              <Button variant="ghost" onClick={() => setConfirmDelete(true)} icon={<Trash2 className="size-4" />}>
                Clear day
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" onClick={submit} loading={save.isPending} disabled={future && consumesNow}>
                Save
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-5">
          {blocks.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {blocks.map((b) => (
                <Badge key={b.id} tone="rest">
                  {BLOCK_KIND[b.kind]}
                  {b.note ? ` · ${b.note}` : ""}
                </Badge>
              ))}
            </div>
          )}

          <Field label="Gym">
            <Segmented
              value={gym}
              onChange={setGym}
              ariaLabel="Gym attendance"
              options={(["attended", "absent", "rest", "unverified"] as GymStatus[]).map((g) => ({ value: g, label: GYM_STATUS[g].short }))}
            />
          </Field>

          {d.ptEnabled && (
          <Field label="PT session" hint={pt === "unverified" ? "Not confirmed yet — pick what happened." : undefined}>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {PT_ORDER.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setPt(s)}
                  aria-pressed={pt === s}
                  className={cx(
                    "rounded-xl border px-3 py-2 text-left transition-colors",
                    pt === s ? "border-ink bg-surface-2" : "border-line hover:bg-surface-2/60",
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                    {s === "client_cancelled" ? selfCancelledLabel(d.profile.display_name) : PT_STATUS[s].label}
                    {PT_STATUS[s].consumes && <Badge tone={s === "completed" ? "good" : "loss"}>−1 session</Badge>}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">{PT_STATUS[s].help}</span>
                </button>
              ))}
            </div>
          </Field>
          )}

          {d.ptEnabled && pt === "rescheduled" && (
            <Field label="Moved to" hint="Record the make-up day as completed when it happens — it is only counted once.">
              <Input type="date" value={movedTo} onChange={(e) => setMovedTo(e.target.value)} />
            </Field>
          )}

          {["completed", "chargeable_absence", "missed_unconfirmed", "trainer_cancelled", "client_cancelled", "rescheduled"].includes(pt) && d.ptEnabled && d.packages.length > 1 && (
            <Field label="Package" hint="Automatic picks the oldest active package that covers this date and still has sessions.">
              <Select value={pkgId} onChange={(e) => setPkgId(e.target.value)}>
                <option value="">Automatic{autoPkg ? ` (${autoPkg.trainer_name}, from ${formatDate(autoPkg.start_date)})` : ""}</option>
                {d.packages
                  .filter((p) => p.status !== "cancelled")
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.trainer_name} · {p.label ?? formatDate(p.start_date)} · {p.remaining} left
                    </option>
                  ))}
              </Select>
            </Field>
          )}

          {(gym === "absent" || pt === "chargeable_absence" || pt === "missed_unconfirmed" || pt === "client_cancelled") && (
            <Field label="Reason">
              <div className="flex flex-wrap gap-2">
                {ABSENCE_REASONS.map((r) => (
                  <Chip key={r.value} selected={reason === r.value} onClick={() => setReason(reason === r.value ? null : r.value)}>
                    {r.label}
                  </Chip>
                ))}
              </div>
            </Field>
          )}

          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </Field>

          {d.ptEnabled && (
            <div className={cx("rounded-xl px-3 py-2.5 text-sm", consumesNow !== consumedBefore ? "bg-warn-soft text-warn" : "bg-surface-2 text-ink-2")}>
              {future && consumesNow ? "Sessions can't be marked completed or missed before the day happens." : impact}
            </div>
          )}

          {workouts.length > 0 && (
            <div>
              <p className="mb-1.5 text-[13px] font-medium text-ink-2">Workouts on this day</p>
              <ul className="space-y-1">
                {workouts.map((w) => (
                  <li key={w.id}>
                    <Link href={`/workouts/${w.id}`} className="text-sm font-medium text-ink underline-offset-2 hover:underline">
                      {w.title || w.muscle_groups.join(", ") || "Workout"} · {w.exercises.length} exercises
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {date === d.today && (
            <Link href="/#today-workout" className="inline-block text-sm font-medium text-muted underline-offset-2 hover:text-ink hover:underline">
              + Log today&apos;s exercises
            </Link>
          )}

          {history.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-ink-2">
                <HistoryIcon className="size-3.5" /> Change history
              </p>
              <ol className="space-y-1.5 border-l border-line pl-3 text-xs text-muted">
                {history.map((h) => (
                  <li key={h.id}>
                    <span className="font-medium text-ink-2">{new Date(h.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>{" "}
                    {h.action === "insert"
                      ? `created: gym ${String(h.new_data?.gym_status)}, PT ${String(h.new_data?.pt_status)}`
                      : (h.changed ?? [])
                          .filter((c) => !["updated_at"].includes(c))
                          .map((c) => `${c}: ${String(h.old_data?.[c] ?? "—")} → ${String(h.new_data?.[c] ?? "—")}`)
                          .join("; ")}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </Sheet>
      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Clear this day?"
        confirmLabel="Clear day"
        loading={del.isPending}
        onConfirm={async () => {
          try {
            await del.mutateAsync(rec!.id);
            toast.success("Day cleared. It's unconfirmed again.");
            setConfirmDelete(false);
            onClose();
          } catch (e) {
            toast.error(e);
          }
        }}
      >
        The record is removed and the day goes back to <strong>unconfirmed</strong>. Any PT session it used is returned to the balance; the
        voided entry stays in the audit history.
      </ConfirmSheet>
    </>
  );
}
