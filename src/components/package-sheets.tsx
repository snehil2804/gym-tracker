"use client";

import { useState } from "react";
import { Button, Choice, Field, Input, Segmented, Select, Sheet, Switch, Textarea, useToast, cx } from "@/components/ui";
import {
  useClosePackage,
  useSavePayment,
  useSessionAdjustment,
  useUpdatePackage,
} from "@/lib/data/hooks";
import { weekdayLabel } from "@/lib/domain/dates";
import { formatMoney, paiseToInput, parseMoneyToPaise, sessionValue } from "@/lib/domain/money";
import type { PackageSummary, Payment } from "@/lib/types";

// ---------------------------------------------------------------------------
export function PaymentSheet({
  pkg,
  payment,
  today,
  onClose,
}: {
  pkg: PackageSummary;
  payment?: Payment;
  today: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const save = useSavePayment();
  const [kind, setKind] = useState<Payment["kind"]>(payment?.kind ?? "payment");
  const [status, setStatus] = useState<Payment["status"]>(payment?.status ?? "paid");
  const [amount, setAmount] = useState(payment ? paiseToInput(payment.amount_paise) : pkg.outstanding_paise > 0 ? paiseToInput(pkg.outstanding_paise) : "");
  const [paidOn, setPaidOn] = useState(payment?.paid_on ?? today);
  const [dueOn, setDueOn] = useState(payment?.due_on ?? "");
  const [method, setMethod] = useState(payment?.method ?? "");
  const [note, setNote] = useState(payment?.note ?? "");
  const paise = parseMoneyToPaise(amount);

  async function submit() {
    if (!paise) return;
    try {
      await save.mutateAsync({
        id: payment?.id,
        package_id: pkg.id,
        kind,
        status: kind === "refund" ? "paid" : status,
        amount_paise: paise,
        paid_on: status === "paid" || kind === "refund" ? paidOn : null,
        due_on: status === "pending" ? dueOn || null : null,
        method: method || null,
        note: note || null,
      });
      toast.success(kind === "refund" ? "Refund recorded." : status === "paid" ? "Payment recorded." : "Pending payment saved.");
      onClose();
    } catch (e) {
      toast.error(e);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={payment ? "Edit payment" : "Record a payment"}
      description={`${pkg.trainer_name} · package price ${formatMoney(pkg.price_paise)} · ${formatMoney(pkg.outstanding_paise)} not yet paid`}
      footer={
        <Button variant="primary" block size="lg" loading={save.isPending} disabled={!paise || (status === "paid" && !paidOn)} onClick={submit}>
          Save
        </Button>
      }
    >
      <div className="space-y-4">
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: "payment", label: "Payment to trainer" },
            { value: "refund", label: "Refund received" },
          ]}
        />
        {kind === "payment" && (
          <Field label="Status" hint="Pending amounts are never counted as money spent.">
            <Segmented
              value={status}
              onChange={setStatus}
              options={[
                { value: "paid", label: "Paid" },
                { value: "pending", label: "Pending" },
              ]}
            />
          </Field>
        )}
        <Field label="Amount" error={amount && !paise ? "Enter an amount like 6000 or 6,000.50" : undefined}>
          <Input inputMode="decimal" prefix="₹" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="6,000" data-autofocus />
        </Field>
        {status === "paid" || kind === "refund" ? (
          <Field label={kind === "refund" ? "Refunded on" : "Paid on"}>
            <Input type="date" value={paidOn} max={today} onChange={(e) => setPaidOn(e.target.value)} />
          </Field>
        ) : (
          <Field label="Due on (optional)">
            <Input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
          </Field>
        )}
        <Field label="Method (optional)">
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="">—</option>
            {["UPI", "Cash", "Card", "Bank transfer", "Other"].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
        </Field>
        <Field label="Note (optional)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
export function AdjustSheet({ pkg, today, onClose }: { pkg: PackageSummary; today: string; onClose: () => void }) {
  const toast = useToast();
  const adjust = useSessionAdjustment();
  const [kind, setKind] = useState<"credit" | "refund" | "adjustment">("credit");
  const [n, setN] = useState("1");
  const [sign, setSign] = useState<"+" | "-">("+");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(today);
  const count = Number.parseInt(n, 10);
  const valid = Number.isInteger(count) && count > 0 && (kind !== "adjustment" || note.trim().length > 0);
  const rate = sessionValue(1, pkg.price_paise, pkg.sessions_purchased);

  return (
    <Sheet
      open
      onClose={onClose}
      title="Adjust sessions"
      description="For changes that don't come from a single day's attendance."
      footer={
        <Button
          variant="primary"
          block
          size="lg"
          disabled={!valid}
          loading={adjust.isPending}
          onClick={async () => {
            try {
              await adjust.mutateAsync({
                packageId: pkg.id,
                kind,
                sessions: kind === "adjustment" && sign === "-" ? -count : count,
                note: note.trim() || undefined,
                date,
              });
              toast.success("Balance updated.");
              onClose();
            } catch (e) {
              toast.error(e);
            }
          }}
        >
          Save
        </Button>
      }
    >
      <div className="space-y-3">
        <Choice
          selected={kind === "credit"}
          onClick={() => setKind("credit")}
          title="Credit from trainer (+)"
          description="Free or make-up sessions added to your balance. Not cash."
          tone="good"
        />
        <Choice
          selected={kind === "refund"}
          onClick={() => setKind("refund")}
          title="Refunded sessions (−)"
          description="Sessions removed because money was returned. Record the money as a refund payment too."
          tone="info"
        />
        <Choice
          selected={kind === "adjustment"}
          onClick={() => setKind("adjustment")}
          title="Correction (±)"
          description="Anything else. Needs a note explaining why."
          tone="warn"
        />
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Field label="Sessions">
            <div className="flex gap-2">
              {kind === "adjustment" && (
                <Segmented
                  value={sign}
                  onChange={setSign}
                  options={[
                    { value: "+", label: "+" },
                    { value: "-", label: "−" },
                  ]}
                />
              )}
              <Input inputMode="numeric" value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, ""))} />
            </div>
          </Field>
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label={kind === "adjustment" ? "Reason (required)" : "Note (optional)"}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </Field>
        {valid && (
          <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink-2">
            Balance {kind === "credit" || (kind === "adjustment" && sign === "+") ? "+" : "−"}
            {count} → {pkg.remaining + (kind === "credit" || (kind === "adjustment" && sign === "+") ? count : -count)} sessions ·{" "}
            {formatMoney(sessionValue(count, pkg.price_paise, pkg.sessions_purchased))} at {formatMoney(rate)}/session
          </p>
        )}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
export function EditPackageSheet({ pkg, onClose }: { pkg: PackageSummary; onClose: () => void }) {
  const toast = useToast();
  const update = useUpdatePackage();
  const locked = pkg.completed + pkg.forfeited > 0;
  const [label, setLabel] = useState(pkg.label ?? "");
  const [price, setPrice] = useState(paiseToInput(pkg.price_paise));
  const [sessions, setSessions] = useState(String(pkg.sessions_purchased));
  const [start, setStart] = useState(pkg.start_date);
  const [expiry, setExpiry] = useState(pkg.expiry_date ?? "");
  const [purchased, setPurchased] = useState(pkg.purchased_on ?? "");
  const [days, setDays] = useState<number[]>(pkg.schedule_days);
  const [noSunday, setNoSunday] = useState(pkg.exclude_sundays);
  const [rollover, setRollover] = useState(pkg.rollover_allowed);
  const [pausable, setPausable] = useState(pkg.pausable);
  const [extension, setExtension] = useState(pkg.extension_allowed);
  const [notes, setNotes] = useState(pkg.notes ?? "");
  const paise = parseMoneyToPaise(price);

  return (
    <Sheet
      open
      onClose={onClose}
      wide
      title="Edit package"
      footer={
        <Button
          variant="primary"
          block
          size="lg"
          loading={update.isPending}
          disabled={!paise || !Number(sessions) || days.length === 0}
          onClick={async () => {
            try {
              await update.mutateAsync({
                id: pkg.id,
                patch: {
                  label: label || null,
                  ...(locked ? {} : { price_paise: paise, sessions_purchased: Number(sessions) }),
                  start_date: start,
                  expiry_date: expiry || null,
                  purchased_on: purchased || null,
                  schedule_days: days,
                  exclude_sundays: noSunday,
                  sessions_per_week: days.length,
                  rollover_allowed: rollover,
                  pausable,
                  extension_allowed: extension,
                  notes: notes || null,
                },
              });
              toast.success("Package updated.");
              onClose();
            } catch (e) {
              toast.error(e);
            }
          }}
        >
          Save changes
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Label (optional)">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Oct–Nov package" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Price" hint={locked ? "Locked: sessions are already recorded." : undefined}>
            <Input prefix="₹" inputMode="decimal" value={price} disabled={locked} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          <Field label="Sessions purchased">
            <Input inputMode="numeric" value={sessions} disabled={locked} onChange={(e) => setSessions(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="Start date">
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Expiry (optional)">
            <Input type="date" value={expiry} min={start} onChange={(e) => setExpiry(e.target.value)} />
          </Field>
          <Field label="Purchased on (optional)">
            <Input type="date" value={purchased} onChange={(e) => setPurchased(e.target.value)} />
          </Field>
        </div>
        <ScheduleDays days={days} setDays={setDays} noSunday={noSunday} setNoSunday={setNoSunday} />
        <div className="divide-y divide-line rounded-xl border border-line px-3">
          <Switch checked={rollover} onChange={setRollover} label="Unused sessions can roll over" />
          <Switch checked={pausable} onChange={setPausable} label="Package can be paused" />
          <Switch checked={extension} onChange={setExtension} label="Expiry can be extended" description="Allows recording sessions after the expiry date." />
        </div>
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>
      </div>
    </Sheet>
  );
}

export function ScheduleDays({
  days,
  setDays,
  noSunday,
  setNoSunday,
}: {
  days: number[];
  setDays: (d: number[]) => void;
  noSunday: boolean;
  setNoSunday: (b: boolean) => void;
}) {
  const presets: { label: string; days: number[] }[] = [
    { label: "Mon–Sat", days: [1, 2, 3, 4, 5, 6] },
    { label: "Mon–Fri", days: [1, 2, 3, 4, 5] },
    { label: "4 days", days: [1, 2, 4, 5] },
    { label: "3 days", days: [1, 3, 5] },
  ];
  return (
    <Field label="Training days" hint={`${days.length} sessions a week. Used to forecast your next session and when the package runs out.`}>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => {
              setDays(p.days);
            }}
            className={cx(
              "h-8 rounded-full border px-3 text-xs font-medium",
              p.days.join() === days.join() ? "border-ink bg-primary text-primary-ink" : "border-line-strong text-ink-2 hover:bg-surface-2",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1">
        {[1, 2, 3, 4, 5, 6, 7].map((w) => {
          const on = days.includes(w);
          const disabled = w === 7 && noSunday;
          return (
            <button
              key={w}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              onClick={() => setDays(on ? days.filter((x) => x !== w) : [...days, w].sort())}
              className={cx(
                "h-10 rounded-xl border text-xs font-semibold transition-colors disabled:opacity-35",
                on ? "border-ink bg-primary text-primary-ink" : "border-line-strong text-ink-2 hover:bg-surface-2",
              )}
            >
              {weekdayLabel(w)}
            </button>
          );
        })}
      </div>
      <Switch
        checked={noSunday}
        onChange={(b) => {
          setNoSunday(b);
          if (b) setDays(days.filter((x) => x !== 7));
        }}
        label="Exclude Sundays"
      />
    </Field>
  );
}

// ---------------------------------------------------------------------------
export function ClosePackageSheet({
  pkg,
  packages,
  today,
  onClose,
}: {
  pkg: PackageSummary;
  packages: PackageSummary[];
  today: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const close = useClosePackage();
  const targets = packages.filter((p) => p.id !== pkg.id && p.status === "active");
  const [treatment, setTreatment] = useState<string>(pkg.remaining > 0 ? "undecided" : "undecided");
  const [target, setTarget] = useState(targets[0]?.id ?? "");
  const [closedOn, setClosedOn] = useState(today);
  const [note, setNote] = useState("");
  const rate = sessionValue(1, pkg.price_paise, pkg.sessions_purchased);
  const value = formatMoney(sessionValue(pkg.remaining, pkg.price_paise, pkg.sessions_purchased));

  return (
    <Sheet
      open
      onClose={onClose}
      title="Close package"
      description={pkg.remaining > 0 ? `${pkg.remaining} unused sessions (${value} at ${formatMoney(rate)} each). Nothing happens to them unless you choose.` : "All sessions are used."}
      footer={
        <Button
          variant="primary"
          block
          size="lg"
          loading={close.isPending}
          disabled={treatment === "rolled_over" && !target}
          onClick={async () => {
            try {
              await close.mutateAsync({ id: pkg.id, closedOn, treatment, targetId: treatment === "rolled_over" ? target : null, note });
              toast.success(treatment === "still_usable" ? "Marked: unused sessions still usable." : "Package closed. Its history is kept.");
              onClose();
            } catch (e) {
              toast.error(e);
            }
          }}
        >
          {treatment === "still_usable" ? "Save" : "Close package"}
        </Button>
      }
    >
      <div className="space-y-3">
        {pkg.remaining > 0 && (
          <>
            <Choice selected={treatment === "undecided"} onClick={() => setTreatment("undecided")} title="Close, decide about unused sessions later" description="Sessions stay on record as unused; not counted as lost." />
            <Choice selected={treatment === "still_usable"} onClick={() => setTreatment("still_usable")} title="Keep them usable" description="Package stays open; sessions can still be attended." tone="good" />
            <Choice
              selected={treatment === "rolled_over"}
              onClick={() => setTreatment("rolled_over")}
              title="Roll over to another package"
              description={targets.length ? "Moves exactly the unused sessions; recorded on both packages." : "Create the new package first."}
              tone="info"
            />
            {treatment === "rolled_over" && targets.length > 0 && (
              <Select value={target} onChange={(e) => setTarget(e.target.value)}>
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.trainer_name} · from {t.start_date}
                  </option>
                ))}
              </Select>
            )}
            <Choice selected={treatment === "forfeited"} onClick={() => setTreatment("forfeited")} title="Forfeited" description={`Trainer won't honour them. ${value} recorded as unused value lost.`} tone="accent" />
            <Choice selected={treatment === "refunded"} onClick={() => setTreatment("refunded")} title="Refunded" description="Removed from the balance. Record the refunded money as a refund payment." tone="violet" />
          </>
        )}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <Field label="Closed on">
            <Input type="date" value={closedOn} onChange={(e) => setClosedOn(e.target.value)} />
          </Field>
          <Field label="Note (optional)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </div>
    </Sheet>
  );
}
