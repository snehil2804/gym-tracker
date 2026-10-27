"use client";

import { useState } from "react";
import { Badge, Button, Card, Estimate, Field, Input, Select, Switch, Textarea, useToast } from "@/components/ui";
import { useSaveMembership, useSaveTrainer, useTrainers } from "@/lib/data/hooks";
import { addDays, addMonths, daysBetween, formatDate } from "@/lib/domain/dates";
import { formatMoney, paiseToInput, parseMoneyToPaise } from "@/lib/domain/money";
import type { Membership } from "@/lib/types";

/** Editors for the gym membership and trainers (moved here from Settings). */

export function MembershipForm({ m, today, onDone, bare }: { m?: Membership; today: string; onDone?: () => void; /** No card frame (used inside a collapsible panel). */ bare?: boolean }) {
  const toast = useToast();
  const save = useSaveMembership();
  const [gym, setGym] = useState(m?.gym_name ?? "");
  const [start, setStart] = useState(m?.start_date ?? today);
  const [months, setMonths] = useState(String(m?.duration_months ?? 3));
  const [confirmed, setConfirmed] = useState(m?.confirmed_end_date ?? "");
  const [price, setPrice] = useState(m ? paiseToInput(m.price_paise) : "");
  const [approx, setApprox] = useState(m?.price_is_approximate ?? false);
  const [status, setStatus] = useState<Membership["payment_status"]>(m?.payment_status ?? "paid");
  const [paidOn, setPaidOn] = useState(m?.paid_on ?? "");
  const [notes, setNotes] = useState(m?.notes ?? "");
  const estimate = Number(months) > 0 ? addDays(addMonths(start, Number(months)), -1) : null;
  const paise = parseMoneyToPaise(price || "0");

  return (
    <Card className={bare ? "space-y-4 border-0 bg-transparent p-0 shadow-none" : "space-y-4 p-5"}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Gym">
          <Input value={gym} onChange={(e) => setGym(e.target.value)} />
        </Field>
        <Field label="Start date">
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Duration (months)">
          <Input inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value.replace(/\D/g, ""))} />
        </Field>
      </div>
      <div className="grid gap-4 rounded-xl bg-surface-2 p-4 sm:grid-cols-2">
        <div>
          <p className="flex items-center gap-2 text-[13px] font-medium text-ink-2">
            Estimated last day <Estimate />
          </p>
          <p className="num mt-1 font-display text-xl font-semibold">{estimate ? formatDate(estimate) : "—"}</p>
          <p className="text-xs text-muted">Start + {months || "?"} months − 1 day. Your gym may count differently.</p>
        </div>
        <Field label="Confirmed contract end date" hint={confirmed ? (estimate && confirmed !== estimate ? `${daysBetween(estimate, confirmed) > 0 ? "+" : ""}${daysBetween(estimate, confirmed)} days vs estimate` : "Matches the estimate") : "Leave empty until you've checked with the gym."}>
          <div className="flex gap-2">
            <Input type="date" value={confirmed} min={start} onChange={(e) => setConfirmed(e.target.value)} />
            {!confirmed && estimate && (
              <Button size="sm" className="h-11 shrink-0" onClick={() => setConfirmed(estimate)}>
                Estimate is right
              </Button>
            )}
          </div>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Price">
          <Input prefix="₹" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <Field label="Payment">
          <Select value={status} onChange={(e) => setStatus(e.target.value as Membership["payment_status"])}>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="unconfirmed">Not confirmed</option>
          </Select>
        </Field>
        {status === "paid" && (
          <Field label="Paid on (optional)">
            <Input type="date" value={paidOn} max={today} onChange={(e) => setPaidOn(e.target.value)} />
          </Field>
        )}
      </div>
      <Switch checked={approx} onChange={setApprox} label="Price is approximate" description="Untick once you've confirmed the exact amount." />
      <Field label="Notes">
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted">
          {m && (
            <>
              <Badge tone={m.confirmed_end_date ? "good" : "warn"}>{m.confirmed_end_date ? "Expiry confirmed" : "Expiry not confirmed"}</Badge>{" "}
              {m.payment_status === "paid" ? `${formatMoney(m.price_paise)} counted as spent` : "not counted as spent"}
            </>
          )}
        </span>
        <div className="flex gap-2">
          {onDone && (
            <Button variant="ghost" onClick={onDone}>
              Cancel
            </Button>
          )}
          <Button
            variant="primary"
            loading={save.isPending}
            disabled={!gym.trim() || !(Number(months) > 0) || paise === null}
            onClick={async () => {
              try {
                await save.mutateAsync({
                  id: m?.id,
                  gym_name: gym.trim(),
                  start_date: start,
                  duration_months: Number(months),
                  confirmed_end_date: confirmed || null,
                  price_paise: paise ?? 0,
                  price_is_approximate: approx,
                  payment_status: status,
                  paid_on: status === "paid" ? paidOn || null : null,
                  notes: notes || null,
                });
                toast.success("Membership saved.");
                onDone?.();
              } catch (e) {
                toast.error(e);
              }
            }}
          >
            Save membership
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function TrainersCard() {
  const trainers = useTrainers();
  const save = useSaveTrainer();
  const toast = useToast();
  const [name, setName] = useState("");
  return (
    <Card className="p-5">
      <ul className="divide-y divide-line">
        {(trainers.data ?? []).map((t) => (
          <TrainerRow key={t.id} id={t.id} name={t.name} phone={t.phone} active={t.is_active} />
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <Input placeholder="Add a trainer" value={name} onChange={(e) => setName(e.target.value)} />
        <Button
          disabled={!name.trim()}
          loading={save.isPending}
          onClick={async () => {
            try {
              await save.mutateAsync({ name: name.trim() });
              setName("");
            } catch (e) {
              toast.error(e);
            }
          }}
        >
          Add
        </Button>
      </div>
    </Card>
  );
}

function TrainerRow({ id, name, phone, active }: { id: string; name: string; phone: string | null; active: boolean }) {
  const save = useSaveTrainer();
  const toast = useToast();
  const [n, setN] = useState(name);
  const [p, setP] = useState(phone ?? "");
  const dirty = n !== name || p !== (phone ?? "");
  return (
    <li className="flex flex-wrap items-center gap-2 py-2">
      <Input className="min-w-32 flex-1" value={n} onChange={(e) => setN(e.target.value)} aria-label="Trainer name" />
      <Input className="w-40" placeholder="Phone" value={p} onChange={(e) => setP(e.target.value)} aria-label="Trainer phone" />
      <Button size="sm" variant="ghost" onClick={() => save.mutateAsync({ id, is_active: !active }).catch(toast.error)}>
        {active ? "Active" : "Inactive"}
      </Button>
      {dirty && (
        <Button size="sm" variant="primary" loading={save.isPending} onClick={() => save.mutateAsync({ id, name: n.trim(), phone: p || null }).then(() => toast.success("Trainer saved.")).catch(toast.error)}>
          Save
        </Button>
      )}
    </li>
  );
}

