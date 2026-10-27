"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ScheduleDays } from "@/components/package-sheets";
import { Badge, Button, Card, Choice, ErrorNote, Field, Input, Segmented, Select, Skeleton, Switch, Textarea, useToast, PtOffNotice } from "@/components/ui";
import { useCore, type Core } from "@/lib/data/derived";
import { useClosePackage, useCreatePackage, useTrainers } from "@/lib/data/hooks";
import { addDays, formatDate, maxDate } from "@/lib/domain/dates";
import { formatMoney, parseMoneyToPaise, sessionValue } from "@/lib/domain/money";
import { packageState } from "@/lib/domain/packages";

export default function NewPackagePage() {
  const { data: d, loading, error } = useCore();
  if (error) return <ErrorNote error={error} />;
  if (loading || !d) return <Skeleton className="h-96" />;
  if (!d.ptEnabled) return <PtOffNotice />;
  return <PackageForm d={d} />;
}

type PayMode = "paid" | "partial" | "pending";
type Unused = "keep" | "rolled_over" | "forfeited" | "refunded" | "later";

function PackageForm({ d }: { d: Core }) {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const trainers = useTrainers();
  const create = useCreatePackage();
  const closePkg = useClosePackage();

  const renewing = d.packages.find((p) => p.id === params.get("renew"));
  const suggestedStart = renewing
    ? maxDate(d.today, renewing.last_session_date ? addDays(renewing.last_session_date, 1) : d.today)
    : d.today;

  const [sameTrainer, setSameTrainer] = useState(true);
  const [trainerName, setTrainerName] = useState(renewing?.trainer_name ?? trainers.data?.[0]?.name ?? "");
  const [label, setLabel] = useState("");
  const [price, setPrice] = useState("");
  const [sessions, setSessions] = useState(renewing ? String(renewing.sessions_purchased) : "");
  const [start, setStart] = useState(suggestedStart);
  const [expires, setExpires] = useState(false);
  const [expiry, setExpiry] = useState("");
  const [days, setDays] = useState<number[]>(renewing?.schedule_days ?? [1, 2, 3, 4, 5, 6]);
  const [noSunday, setNoSunday] = useState(renewing?.exclude_sundays ?? true);
  const [rollover, setRollover] = useState(renewing?.rollover_allowed ?? false);
  const [pausable, setPausable] = useState(renewing?.pausable ?? false);
  const [extension, setExtension] = useState(renewing?.extension_allowed ?? false);
  const [payMode, setPayMode] = useState<PayMode>("paid");
  const [paidAmount, setPaidAmount] = useState("");
  const [paidOn, setPaidOn] = useState(d.today);
  const [dueOn, setDueOn] = useState("");
  const [method, setMethod] = useState("UPI");
  const [notes, setNotes] = useState("");
  const [unused, setUnused] = useState<Unused>("keep");

  const pricePaise = parseMoneyToPaise(price);
  const n = Number.parseInt(sessions, 10);
  const partialPaise = parseMoneyToPaise(paidAmount);
  const leftover = renewing && renewing.status === "active" ? Math.max(renewing.remaining, 0) : 0;
  const trainer = renewing && sameTrainer ? renewing.trainer_name : trainerName.trim();

  const errors: string[] = [];
  if (!trainer) errors.push("Trainer name is required.");
  if (pricePaise === null || pricePaise <= 0) errors.push("Enter what the trainer charged.");
  if (!Number.isInteger(n) || n <= 0) errors.push("Enter the number of sessions purchased.");
  if (expires && (!expiry || expiry < start)) errors.push("Expiry must be on or after the start date.");
  if (days.length === 0) errors.push("Pick at least one training day.");
  if (payMode === "partial" && (!partialPaise || (pricePaise && partialPaise >= pricePaise))) errors.push("Partial amount must be less than the price.");

  async function submit() {
    if (errors.length || !pricePaise) return;
    const payments =
      payMode === "paid"
        ? [{ amount_paise: pricePaise, status: "paid", paid_on: paidOn, method }]
        : payMode === "partial"
          ? [
              { amount_paise: partialPaise, status: "paid", paid_on: paidOn, method },
              { amount_paise: pricePaise - (partialPaise ?? 0), status: "pending", due_on: dueOn || null },
            ]
          : [{ amount_paise: pricePaise, status: "pending", due_on: dueOn || null }];
    try {
      const id = await create.mutateAsync({
        trainer_name: trainer,
        label: label || null,
        price_paise: pricePaise,
        sessions_purchased: n,
        purchased_on: payMode === "pending" ? null : paidOn,
        start_date: start,
        expiry_date: expires ? expiry : null,
        schedule_days: days,
        exclude_sundays: noSunday,
        sessions_per_week: days.length,
        rollover_allowed: rollover,
        pausable,
        extension_allowed: extension,
        renewed_from_id: renewing?.id ?? null,
        notes: notes || null,
        payments,
      });
      if (renewing && renewing.status === "active" && unused !== "keep" && unused !== "later") {
        await closePkg.mutateAsync({
          id: renewing.id,
          closedOn: addDays(start, -1) < renewing.start_date ? renewing.start_date : addDays(start, -1),
          treatment: unused,
          targetId: unused === "rolled_over" ? id : null,
        });
      } else if (renewing && renewing.status === "active" && leftover === 0) {
        await closePkg.mutateAsync({ id: renewing.id, closedOn: maxDate(renewing.start_date, addDays(start, -1)), treatment: "undecided" });
      }
      toast.success(renewing ? "Package renewed. Your previous package and its history are unchanged." : "Package added.");
      router.push(`/packages/${id}`);
    } catch (e) {
      toast.error(e);
    }
  }

  return (
    <div className="anim-rise mx-auto max-w-2xl space-y-4 pb-10">
      <Link href={renewing ? `/packages/${renewing.id}` : "/packages"} className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Back
      </Link>
      <div>
        <h1 className="font-display text-[28px] font-semibold tracking-tight">{renewing ? "Renew PT package" : "New PT package"}</h1>
        {renewing && (
          <p className="mt-1 text-sm text-muted">
            Current: {renewing.trainer_name} · {formatMoney(renewing.price_paise)} for {renewing.sessions_purchased} sessions · {renewing.remaining} left ·{" "}
            <Badge tone={packageState(renewing, d.today).tone}>{packageState(renewing, d.today).label}</Badge>
          </p>
        )}
      </div>

      <Card className="space-y-4 p-5">
        <h2 className="font-semibold">Trainer & price</h2>
        {renewing && (
          <Segmented
            value={sameTrainer ? "same" : "new"}
            onChange={(v) => setSameTrainer(v === "same")}
            options={[
              { value: "same", label: `Same trainer (${renewing.trainer_name})` },
              { value: "new", label: "Different trainer" },
            ]}
          />
        )}
        {(!renewing || !sameTrainer) && (
          <Field label="Trainer name">
            <Input list="trainer-names" value={trainerName} onChange={(e) => setTrainerName(e.target.value)} placeholder="e.g. Soham" />
            <datalist id="trainer-names">
              {(trainers.data ?? []).map((t) => (
                <option key={t.id} value={t.name} />
              ))}
            </datalist>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="How much did the trainer charge?">
            <Input prefix="₹" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="6,000" data-autofocus />
          </Field>
          <Field label="Sessions purchased">
            <Input inputMode="numeric" value={sessions} onChange={(e) => setSessions(e.target.value.replace(/\D/g, ""))} placeholder="30" />
          </Field>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-surface-2 px-4 py-3">
          <span className="text-sm text-muted">Cost per session</span>
          <span className="num font-display text-xl font-semibold">{pricePaise && n > 0 ? formatMoney(sessionValue(1, pricePaise, n)) : "—"}</span>
        </div>
        {renewing && pricePaise && n > 0 && (
          <p className="text-xs text-muted">
            Previous package: {formatMoney(sessionValue(1, renewing.price_paise, renewing.sessions_purchased))} per session. It keeps its own rate for all of its history.
          </p>
        )}
        <Field label="Label (optional)">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Second package" />
        </Field>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="font-semibold">Dates & schedule</h2>
        <Field label="Package start date" hint={start > d.today ? "Starts in the future — no sessions are deducted from it before then." : undefined}>
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Switch checked={expires} onChange={setExpires} label="The package expires" description="Unused sessions after this date may be lost." />
        {expires && (
          <Field label="Expiry date">
            <Input type="date" value={expiry} min={start} onChange={(e) => setExpiry(e.target.value)} />
          </Field>
        )}
        <ScheduleDays days={days} setDays={setDays} noSunday={noSunday} setNoSunday={setNoSunday} />
        <div className="divide-y divide-line rounded-xl border border-line px-3">
          <Switch checked={rollover} onChange={setRollover} label="Unused sessions can roll over" />
          <Switch checked={pausable} onChange={setPausable} label="Package can be paused" />
          <Switch checked={extension} onChange={setExtension} label="Expiry can be extended" />
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="font-semibold">Payment</h2>
        <Segmented
          value={payMode}
          onChange={setPayMode}
          options={[
            { value: "paid", label: "Paid in full" },
            { value: "partial", label: "Part paid" },
            { value: "pending", label: "Not paid yet" },
          ]}
        />
        {payMode === "partial" && (
          <Field label="Amount paid so far">
            <Input prefix="₹" inputMode="decimal" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          {payMode !== "pending" && (
            <>
              <Field label="Payment date">
                <Input type="date" value={paidOn} max={d.today} onChange={(e) => setPaidOn(e.target.value)} />
              </Field>
              <Field label="Method">
                <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                  {["UPI", "Cash", "Card", "Bank transfer", "Other"].map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </Select>
              </Field>
            </>
          )}
          {payMode !== "paid" && (
            <Field label="Balance due on (optional)">
              <Input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
            </Field>
          )}
        </div>
        <p className="text-xs text-muted">Pending amounts are tracked as owed and never counted as money spent.</p>
        <Field label="Payment notes (optional)">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </Card>

      {renewing && leftover > 0 && renewing.status === "active" && (
        <Card className="space-y-3 p-5" tone="warn">
          <h2 className="font-semibold">
            The current package still has {leftover} unused {leftover === 1 ? "session" : "sessions"} (
            {formatMoney(sessionValue(leftover, renewing.price_paise, renewing.sessions_purchased))})
          </h2>
          <p className="text-sm text-muted">Nothing is rolled over, transferred or forfeited unless you choose it here.</p>
          <Choice selected={unused === "keep"} onClick={() => setUnused("keep")} title="Use them first" description="Keep the current package open. New sessions are taken from it until it runs out, then from the new one." tone="good" />
          <Choice selected={unused === "rolled_over"} onClick={() => setUnused("rolled_over")} title="Roll them into the new package" description={`Moves exactly ${leftover} sessions and closes the current package.`} tone="info" />
          <Choice selected={unused === "forfeited"} onClick={() => setUnused("forfeited")} title="They're forfeited" description="The trainer won't honour them. Recorded as unused value lost." tone="accent" />
          <Choice selected={unused === "refunded"} onClick={() => setUnused("refunded")} title="They were refunded" description="Removed from the balance. Add the refund amount under payments." tone="violet" />
          <Choice selected={unused === "later"} onClick={() => setUnused("later")} title="Decide later" description="Leave the current package as it is." />
        </Card>
      )}

      {errors.length > 0 && (price || sessions) && (
        <ul className="space-y-1 text-sm text-accent">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <Button variant="primary" size="lg" block loading={create.isPending || closePkg.isPending} disabled={errors.length > 0} onClick={submit}>
        {renewing ? "Renew package" : "Add package"}
        {pricePaise && n > 0 ? ` · ${formatMoney(pricePaise)} for ${n} sessions` : ""}
      </Button>
      {renewing && (
        <p className="text-center text-xs text-muted">
          Starts {formatDate(start)}. Your previous package&apos;s price, payments and attendance stay exactly as they are.
        </p>
      )}
    </div>
  );
}
