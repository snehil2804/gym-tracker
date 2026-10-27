"use client";

import { Download, FileJson, LogOut, Plus, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Badge,
  Button,
  Card,
  ConfirmSheet,
  ErrorNote,
  Estimate,
  Field,
  Input,
  Segmented,
  Select,
  Sheet,
  Skeleton,
  Switch,
  Textarea,
  useToast,
} from "@/components/ui";
import { useCore, type Core } from "@/lib/data/derived";
import {
  useDeleteBlock,
  useSaveBlock,
  useSaveMembership,
  useSaveTrainer,
  useDeleteAccount,
  useMeasurements,
  useSaveMeasurement,
  useTrainers,
  useUpdateProfile,
  useUser,
  useAvatarUrl,
} from "@/lib/data/hooks";
import { buildArchive, CSV_EXPORTS, download, exportCSV, exportExerciseHistoryCSV, restoreArchive, validateArchive } from "@/lib/data/export";
import { BLOCK_KIND } from "@/lib/domain/attendance";
import { addDays, addMonths, ageOn, daysBetween, formatDate } from "@/lib/domain/dates";
import { AvatarUploader } from "@/components/avatar";
import { rgb, usePhotoPalette, type PhotoPalette } from "@/lib/photo/palette";
import { formatMoney, paiseToInput, parseMoneyToPaise } from "@/lib/domain/money";
import { getSupabase } from "@/lib/supabase/client";
import type { BlockKind, Membership, Profile, Reminders } from "@/lib/types";

const TIMEZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "Australia/Sydney", "UTC"];

export default function SettingsPage() {
  const { data: d, loading, error } = useCore();
  const avatarUrl = useAvatarUrl();
  const palette = usePhotoPalette(avatarUrl);
  useEffect(() => {
    if (!d || !window.location.hash) return;
    // Wait for the sections to render, then jump to the linked one (e.g. #membership).
    const id = window.location.hash;
    const t = setTimeout(() => document.querySelector(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
    return () => clearTimeout(t);
  }, [d]);
  if (error) return <ErrorNote error={error} />;
  if (loading || !d) return <Skeleton className="h-96" />;
  return (
    <div className="relative">
      <PhotoBackdrop url={avatarUrl} palette={palette} />
      <div className="anim-rise relative z-10 mx-auto max-w-3xl space-y-6">
      <AboutYouSection d={d} palette={palette} />
      <TrainingSection profile={d.profile} />
      <ProfileSection profile={d.profile} />
      <MembershipSection d={d} />
      {d.ptEnabled && <TrainersSection />}
      <ScheduleSection d={d} />
      <RemindersSection profile={d.profile} />
      <DataSection />
      <AccountSection />
      <DangerZone d={d} />
      </div>
    </div>
  );
}

function Section({ id, title, description, children }: { id?: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="text-[13px] font-semibold tracking-[0.06em] text-muted uppercase">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      <Card className="mt-3 p-5">{children}</Card>
    </section>
  );
}

function ProfileSection({ profile }: { profile: Profile }) {
  const toast = useToast();
  const update = useUpdateProfile();
  const [p, setP] = useState(profile);
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP((x) => ({ ...x, [k]: v }));
  const fields = ["timezone", "currency", "date_format", "theme", "weekly_workout_goal", "renewal_warning_days", "membership_warning_days", "tracking_start_date"] as const;
  const dirty = fields.some((k) => p[k] !== profile[k]);
  return (
    <Section title="Preferences">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Time zone" hint="Decides which calendar day “today” is.">
          <Select value={p.timezone} onChange={(e) => set("timezone", e.target.value)}>
            {[...new Set([p.timezone, ...TIMEZONES])].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="Currency" hint="All amounts are stored exactly in the smallest unit (paise).">
          <Select value={p.currency} onChange={(e) => set("currency", e.target.value)}>
            <option value="INR">INR — Indian rupee (₹)</option>
          </Select>
        </Field>
        <Field label="Date format">
          <Select value={p.date_format} onChange={(e) => set("date_format", e.target.value)}>
            <option value="d MMM yyyy">26 Oct 2026</option>
            <option value="dd/MM/yyyy">26/10/2026</option>
            <option value="yyyy-MM-dd">2026-10-26</option>
          </Select>
        </Field>
        <Field label="Theme">
          <Segmented
            value={p.theme}
            onChange={(v) => set("theme", v)}
            options={[
              { value: "system", label: "System" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </Field>
        <Field label="Weekly workout goal">
          <Select value={p.weekly_workout_goal} onChange={(e) => set("weekly_workout_goal", Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <option key={n} value={n}>
                {n} days
              </option>
            ))}
          </Select>
        </Field>
        <Field label="PT renewal warning" hint="Warn when the package is estimated to run out within this many days.">
          <Input inputMode="numeric" value={p.renewal_warning_days} onChange={(e) => set("renewal_warning_days", Number(e.target.value.replace(/\D/g, "") || 0))} />
        </Field>
        <Field label="Membership expiry warning (days)">
          <Input inputMode="numeric" value={p.membership_warning_days} onChange={(e) => set("membership_warning_days", Number(e.target.value.replace(/\D/g, "") || 0))} />
        </Field>
        <Field label="Attendance tracking started" hint="Days before this are never asked about.">
          <Input type="date" value={p.tracking_start_date ?? ""} onChange={(e) => set("tracking_start_date", e.target.value || null)} />
        </Field>
      </div>
      <div className="mt-4 flex justify-end">
        <Button
          variant="primary"
          disabled={!dirty}
          loading={update.isPending}
          onClick={async () => {
            try {
              // Only this section's fields — other sections save their own.
              await update.mutateAsync({
                timezone: p.timezone,
                currency: p.currency,
                date_format: p.date_format,
                theme: p.theme,
                weekly_workout_goal: p.weekly_workout_goal,
                renewal_warning_days: p.renewal_warning_days,
                membership_warning_days: p.membership_warning_days,
                tracking_start_date: p.tracking_start_date,
              });
              toast.success("Settings saved.");
            } catch (e) {
              toast.error(e);
            }
          }}
        >
          Save
        </Button>
      </div>
    </Section>
  );
}

function MembershipSection({ d }: { d: Core }) {
  const [adding, setAdding] = useState(false);
  return (
    <section id="membership" className="scroll-mt-20">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-[13px] font-semibold tracking-[0.06em] text-muted uppercase">Gym membership</h2>
          <p className="mt-1 text-sm text-muted">The estimated end date is calculated; the confirmed date is what your contract says.</p>
        </div>
        <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
          Add / renew
        </Button>
      </div>
      <div className="mt-3 space-y-3">
        {adding && <MembershipForm today={d.today} onDone={() => setAdding(false)} />}
        {d.memberships.map((m) => (
          <MembershipForm key={m.id} m={m} today={d.today} />
        ))}
        {d.memberships.length === 0 && !adding && <Card className="p-5 text-sm text-muted">No membership recorded.</Card>}
      </div>
    </section>
  );
}

function MembershipForm({ m, today, onDone }: { m?: Membership; today: string; onDone?: () => void }) {
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
    <Card className="space-y-4 p-5">
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

function TrainersSection() {
  const trainers = useTrainers();
  const save = useSaveTrainer();
  const toast = useToast();
  const [name, setName] = useState("");
  return (
    <Section title="Trainers" description="PT schedules are set per package (PT Packages → Edit).">
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
    </Section>
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

function ScheduleSection({ d }: { d: Core }) {
  const save = useSaveBlock();
  const del = useDeleteBlock();
  const toast = useToast();
  const [kind, setKind] = useState<BlockKind>("vacation");
  const [start, setStart] = useState(d.today);
  const [end, setEnd] = useState(d.today);
  const [pkg, setPkg] = useState("");
  const [note, setNote] = useState("");
  return (
    <Section title="Planned breaks" description="Vacations, rest days, trainer unavailability, holidays and package pauses. Used only for forecasts — they never change attendance or balances.">
      {d.blocks.length > 0 && (
        <ul className="mb-4 divide-y divide-line">
          {d.blocks.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span>
                <Badge tone="rest">{BLOCK_KIND[b.kind]}</Badge> {formatDate(b.start_date)}
                {b.end_date !== b.start_date ? ` – ${formatDate(b.end_date)}` : ""}
                {b.note ? <span className="text-muted"> · {b.note}</span> : null}
              </span>
              <Button size="sm" variant="ghost" aria-label="Remove break" onClick={() => del.mutateAsync(b.id).catch(toast.error)}>
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Kind">
          <Select value={kind} onChange={(e) => setKind(e.target.value as BlockKind)}>
            {Object.entries(BLOCK_KIND).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        {kind === "pause" && (
          <Field label="Package">
            <Select value={pkg} onChange={(e) => setPkg(e.target.value)}>
              <option value="">All packages</option>
              {d.packages
                .filter((p) => p.status === "active")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.trainer_name} · {formatDate(p.start_date)}
                  </option>
                ))}
            </Select>
          </Field>
        )}
        <Field label="From">
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
        </Field>
        <Field label="Note (optional)" className="sm:col-span-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Holiday trip" />
        </Field>
      </div>
      <Button
        className="mt-3"
        icon={<Plus className="size-4" />}
        loading={save.isPending}
        disabled={end < start}
        onClick={async () => {
          try {
            await save.mutateAsync({ kind, start_date: start, end_date: end, package_id: kind === "pause" ? pkg || null : null, note: note || null });
            setNote("");
            toast.success("Break added. Forecasts updated.");
          } catch (e) {
            toast.error(e);
          }
        }}
      >
        Add break
      </Button>
    </Section>
  );
}

const REMINDER_LABELS: [keyof Reminders, string, string][] = [
  ["upcoming_session", "Upcoming PT session", "Shown the day before and on the day."],
  ["package_exhaustion", "Package running out", "Uses the renewal warning threshold."],
  ["package_expiry", "Package expiry", "Including sessions that may go unused."],
  ["membership_expiry", "Gym membership expiry", "Also reminds you to confirm the contract date."],
  ["pending_payments", "Pending payments", "Amounts not yet recorded as paid."],
  ["attendance_confirmation", "Attendance confirmation", "Today's log and past days to review."],
  ["weekly_review", "Weekly progress review", "On Sundays and Mondays."],
];

function RemindersSection({ profile }: { profile: Profile }) {
  const update = useUpdateProfile();
  const toast = useToast();
  return (
    <Section title="Reminders" description="Shown on your dashboard when you open the app. No emails or push notifications are sent.">
      <div className="divide-y divide-line">
        {REMINDER_LABELS.map(([k, label, desc]) => (
          <Switch
            key={k}
            checked={profile.reminders[k]}
            onChange={(v) => update.mutateAsync({ reminders: { ...profile.reminders, [k]: v } }).catch(toast.error)}
            label={label}
            description={desc}
          />
        ))}
      </div>
    </Section>
  );
}

function DataSection() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ archive: unknown; counts: Record<string, number> } | null>(null);
  const stamp = () => new Date().toISOString().slice(0, 10);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Section title="Export & backup" description="Exports contain only your own records. Amounts are in paise; dates are ISO (YYYY-MM-DD).">
      <Button
        variant="primary"
        icon={<FileJson className="size-4" />}
        loading={busy === "json"}
        onClick={() =>
          run("json", async () => {
            const a = await buildArchive();
            download(`rep-ledger-archive-${stamp()}.json`, JSON.stringify(a, null, 2), "application/json");
            toast.success("Full archive downloaded.");
          })
        }
      >
        Download full archive (JSON)
      </Button>
      <p className="mt-2 text-xs text-muted">
        Includes every table, IDs and relationships, voided ledger entries and the audit log. Progress photo image files are not included — only their metadata.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {CSV_EXPORTS.map((c) => (
          <Button
            key={c.key}
            icon={<Download className="size-4" />}
            loading={busy === c.key}
            onClick={() => run(c.key, async () => download(`rep-ledger-${c.key}-${stamp()}.csv`, await exportCSV(c.key), "text/csv"))}
          >
            {c.label} (CSV)
          </Button>
        ))}
        <Button icon={<Download className="size-4" />} loading={busy === "sets"} onClick={() => run("sets", async () => download(`rep-ledger-exercise-history-${stamp()}.csv`, await exportExerciseHistoryCSV(), "text/csv"))}>
          Exercise history (CSV)
        </Button>
        <Link href="/finance" className="flex h-10 items-center justify-center rounded-xl border border-dashed border-line-strong px-3 text-sm text-muted hover:bg-surface-2">
          Financial summary → see Money
        </Link>
      </div>

      <div className="mt-6 border-t border-line pt-4">
        <p className="font-medium">Restore from an archive</p>
        <p className="mt-1 text-sm text-muted">
          Adds records from a JSON archive to this account. Existing records are never overwritten, and anything already present (same ID or same date) is skipped — restoring
          the same file twice creates no duplicates. PT session entries are rebuilt from attendance.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            const res = validateArchive(await f.text());
            if (!res.ok) return toast.error(res.error);
            setPending({ archive: res.archive, counts: res.counts });
          }}
        />
        <Button className="mt-3" icon={<Upload className="size-4" />} onClick={() => fileRef.current?.click()}>
          Choose archive file
        </Button>
      </div>
      <ConfirmSheet
        open={!!pending}
        onClose={() => setPending(null)}
        title="Restore this archive?"
        confirmLabel="Restore"
        loading={busy === "restore"}
        onConfirm={() =>
          run("restore", async () => {
            const result = await restoreArchive(pending!.archive);
            setPending(null);
            const added = Object.entries(result)
              .filter(([, n]) => n > 0)
              .map(([k, n]) => `${n} ${k.replace(/_/g, " ")}`)
              .join(", ");
            toast.success(added ? `Restored: ${added}.` : "Nothing new to restore — everything was already here.");
            setTimeout(() => window.location.reload(), 1200);
          })
        }
      >
        <p>The file was validated. It contains:</p>
        <ul className="mt-2 grid grid-cols-2 gap-x-4 text-xs">
          {pending &&
            Object.entries(pending.counts)
              .filter(([, n]) => n > 0)
              .map(([k, n]) => (
                <li key={k}>
                  {k.replace(/_/g, " ")}: <span className="num font-semibold">{n}</span>
                </li>
              ))}
        </ul>
      </ConfirmSheet>
    </Section>
  );
}

function AccountSection() {
  const { data: user } = useUser();
  const toast = useToast();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const providers = ((user?.app_metadata as { providers?: string[] } | undefined)?.providers ?? []) as string[];
  const usesGoogle = providers.includes("google");
  const hasPassword = providers.includes("email");
  return (
    <Section id="account" title="Account">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted">Signed in as</p>
          <p className="truncate text-[15px] font-medium text-ink">{user?.email}</p>
        </div>
        <Badge tone="neutral">{usesGoogle ? "Google sign-in" : "Email & password"}</Badge>
      </div>

      <form
        className="mt-5 border-t border-line pt-5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (pw.length < 8) return;
          setBusy(true);
          const { error } = await getSupabase().auth.updateUser({ password: pw });
          setBusy(false);
          if (error) toast.error(error);
          else {
            setPw("");
            toast.success(hasPassword ? "Password updated." : "Password set. You can now also sign in with email.");
          }
        }}
      >
        <label htmlFor="new-password" className="text-[13px] font-medium text-ink-2">
          {hasPassword ? "Change password" : "Set a password (optional)"}
        </label>
        <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
          <Input id="new-password" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password" className="sm:flex-1" />
          <Button type="submit" className="h-11 shrink-0" disabled={pw.length < 8} loading={busy}>
            {hasPassword ? "Update password" : "Set password"}
          </Button>
        </div>
        <p className="mt-1.5 text-xs text-muted">
          At least 8 characters.{usesGoogle && !hasPassword ? " You can keep using Google — a password just adds email sign-in." : ""}
        </p>
      </form>

      <div className="mt-5 border-t border-line pt-5">
        <Button
          variant="danger"
          icon={<LogOut className="size-4" />}
          onClick={async () => {
            await getSupabase().auth.signOut();
            window.location.replace("/login");
          }}
        >
          Sign out
        </Button>
      </div>
    </Section>
  );
}

function AboutYouSection({ d, palette }: { d: Core; palette: PhotoPalette | null }) {
  const toast = useToast();
  const update = useUpdateProfile();
  const saveWeight = useSaveMeasurement();
  const measurements = useMeasurements();
  const { data: user } = useUser();
  const profile = d.profile;
  const latestWeight = (measurements.data ?? []).filter((m) => m.metric === "Body weight").at(-1);
  const [name, setName] = useState(profile.display_name ?? "");
  const [birth, setBirth] = useState(profile.birth_date ?? "");
  const [height, setHeight] = useState(profile.height_cm ? String(profile.height_cm) : "");
  const [weight, setWeight] = useState("");
  const age = ageOn(birth, d.today);
  const dirty = name !== (profile.display_name ?? "") || birth !== (profile.birth_date ?? "") || height !== (profile.height_cm ? String(profile.height_cm) : "") || weight !== "";
  const invalid = !name.trim() || (birth !== "" && (birth > d.today || age === null)) || (height !== "" && !(Number(height) >= 50 && Number(height) <= 272)) || (weight !== "" && !(Number(weight) > 20 && Number(weight) < 400));

  return (
    <section id="profile" className="scroll-mt-20">
      <div className="flex flex-col items-center pt-4 pb-8 text-center sm:pt-8">
        <AvatarUploader size={196} palette={palette} />
        <h1 className="mt-5 font-display text-[30px] leading-tight font-semibold tracking-tight sm:text-[36px]">{profile.display_name || "Your name"}</h1>
        <p className="mt-1 max-w-full truncate text-sm text-muted">{user?.email}</p>
        {(age !== null || profile.height_cm || latestWeight) && (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {age !== null && <ProfileChip label="Age" value={`${age}`} />}
            {profile.height_cm ? <ProfileChip label="Height" value={`${profile.height_cm} cm`} /> : null}
            {latestWeight ? <ProfileChip label="Weight" value={`${latestWeight.value} kg`} /> : null}
          </div>
        )}
      </div>
      <h2 className="text-[13px] font-semibold tracking-[0.06em] text-muted uppercase">Your profile</h2>
      <div className="mt-3 rounded-2xl border border-line bg-surface/90 shadow-card backdrop-blur">
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Display name">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </Field>
          <Field label="Birth date" hint={age !== null ? `${age} years old` : "Used to show your age."}>
            <Input type="date" value={birth} max={d.today} onChange={(e) => setBirth(e.target.value)} />
          </Field>
          <Field label="Height (cm)">
            <Input inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value.replace(/[^\d.]/g, ""))} placeholder="175" />
          </Field>
          <Field label="Today's weight (kg)" hint={latestWeight ? `Last: ${latestWeight.value} kg on ${formatDate(latestWeight.measured_on)}. Full history in Progress → Body.` : "Saved to Progress → Body."}>
            <Input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value.replace(/[^\d.]/g, ""))} placeholder={latestWeight ? String(latestWeight.value) : "72"} />
          </Field>
          <div className="flex justify-end sm:col-span-2">
            <Button
              variant="primary"
              disabled={!dirty || invalid}
              loading={update.isPending || saveWeight.isPending}
              onClick={async () => {
                try {
                  await update.mutateAsync({ display_name: name.trim(), birth_date: birth || null, height_cm: height ? Number(height) : null });
                  if (weight) await saveWeight.mutateAsync({ measured_on: d.today, metric: "Body weight", value: Number(weight), unit: "kg", note: null });
                  setWeight("");
                  toast.success("Profile saved.");
                } catch (e) {
                  toast.error(e);
                }
              }}
            >
              Save profile
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function TrainingSection({ profile }: { profile: Profile }) {
  const update = useUpdateProfile();
  const toast = useToast();
  const set = (patch: Partial<Profile>, message: string) =>
    update
      .mutateAsync(patch)
      .then(() => toast.success(message))
      .catch(toast.error);
  return (
    <Section id="training" title="What you track" description="Turn features on or off — nothing is deleted when you switch something off.">
      <div className="divide-y divide-line">
        <Switch
          checked={profile.pt_enabled}
          onChange={(v) => set({ pt_enabled: v }, v ? "Personal training is on. Add your package under PT Packages." : "Personal training hidden. Your PT records are kept.")}
          label="Personal training"
          description="PT packages, sessions, missed-session value and renewals. Turn on when you hire a trainer."
        />
        <Switch
          checked={profile.membership_enabled}
          onChange={(v) => set({ membership_enabled: v }, v ? "Gym membership tracking is on." : "Gym membership hidden from the dashboard.")}
          label="Gym membership"
          description="Membership card, expiry reminders and gym spending."
        />
      </div>
      {profile.pt_enabled && (
        <Link href="/packages" className="mt-3 inline-block text-sm font-medium text-ink underline-offset-2 hover:underline">
          Manage PT packages →
        </Link>
      )}
    </Section>
  );
}

function DangerZone({ d }: { d: Core }) {
  const { data: user } = useUser();
  const del = useDeleteAccount();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [step, setStep] = useState<string | null>(null);
  const ready = typed.trim().toUpperCase() === "DELETE";
  const counts = [
    { one: "attendance day", many: "attendance days", n: d.attendance.length },
    { one: "workout", many: "workouts", n: d.workouts.length },
    { one: "PT package", many: "PT packages", n: d.packages.length },
    { one: "payment", many: "payments", n: d.payments.length },
    { one: "membership", many: "memberships", n: d.memberships.length },
  ]
    .filter((c) => c.n > 0)
    .map((c) => ({ n: c.n, label: c.n === 1 ? c.one : c.many }));

  return (
    <section id="delete-account" className="scroll-mt-20">
      <h2 className="text-[13px] font-semibold tracking-[0.06em] text-accent uppercase">Delete account</h2>
      <div className="mt-3 rounded-2xl border border-accent/30 bg-surface p-5 shadow-card">
        <p className="font-semibold">Delete my account and all my data</p>
        <p className="mt-1 text-sm text-muted">
          Permanently removes your login, profile, photos and every record — attendance, PT packages, payments, workouts,
          measurements, goals and history. This can&apos;t be undone. Download a backup above first if you might want it.
        </p>
        <Button className="mt-4" variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setOpen(true)}>
          Delete account…
        </Button>
      </div>
      <Sheet
        open={open}
        onClose={() => (del.isPending ? undefined : (setOpen(false), setTyped("")))}
        title="Delete your account?"
        description={user?.email ?? undefined}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={del.isPending} onClick={() => (setOpen(false), setTyped(""))}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!ready}
              loading={del.isPending}
              onClick={async () => {
                try {
                  await del.mutateAsync({ confirm: typed, onStep: setStep });
                  try {
                    sessionStorage.clear();
                    localStorage.removeItem("rl-hidden-money");
                  } catch {}
                  window.location.replace("/login?deleted=1");
                } catch (e) {
                  setStep(null);
                  toast.error(e);
                }
              }}
            >
              Delete everything
            </Button>
          </div>
        }
      >
        <div className="space-y-4 text-sm">
          <p className="text-ink-2">This permanently deletes:</p>
          <ul className="grid gap-1.5 rounded-xl bg-surface-2 p-3 text-ink-2">
            <li>• Your login{user?.app_metadata?.provider === "google" ? " (Google sign-in link)" : ""} and profile</li>
            <li>• Your profile photo and all progress photos</li>
            <li>
              • {counts.length ? counts.map((c) => `${c.n} ${c.label}`).join(", ") : "All your records"}, plus goals, measurements, the
              exercise library and the change history
            </li>
          </ul>
          <p className="text-muted">
            Only a minimal note that an account with this email existed (and when it was created and deleted) is kept. Signing in again later
            starts a brand-new, empty account.
          </p>
          <Field label='Type "DELETE" to confirm'>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" placeholder="DELETE" data-autofocus />
          </Field>
          {step && <p className="rounded-xl bg-warn-soft px-3 py-2 text-warn">{step}</p>}
        </div>
      </Sheet>
    </section>
  );
}

/**
 * Window-wide backdrop made from the profile photo itself: a heavily blurred copy at the top, plus
 * soft washes of the photo's colours lower down, so the whole page carries its tone while scrolling.
 */
function PhotoBackdrop({ url, palette }: { url: string | null; palette: PhotoPalette | null }) {
  const a = palette ? rgb(palette.left, 0.16) : "color-mix(in oklab, var(--accent) 16%, transparent)";
  const b = palette ? rgb(palette.right, 0.14) : "color-mix(in oklab, var(--good) 14%, transparent)";
  const v = palette ? rgb(palette.vivid, 0.1) : "color-mix(in oklab, var(--info) 10%, transparent)";
  const fade = "linear-gradient(to bottom, black 0%, black 35%, transparent 100%)";
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden md:left-60">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          referrerPolicy="no-referrer"
          className="absolute inset-x-0 top-0 h-[75vh] min-h-[480px] w-full scale-125 object-cover"
          style={{ filter: "blur(72px) saturate(1.6)", opacity: "var(--photo-glow)", maskImage: fade, WebkitMaskImage: fade }}
        />
      ) : (
        <div
          className="absolute inset-x-0 top-0 h-[70vh] min-h-[460px]"
          style={{
            background:
              "radial-gradient(65% 75% at 10% 0%, color-mix(in oklab, var(--accent) 24%, transparent), transparent 70%), radial-gradient(60% 70% at 92% 5%, color-mix(in oklab, var(--good) 22%, transparent), transparent 70%)",
            maskImage: fade,
            WebkitMaskImage: fade,
          }}
        />
      )}
      {/* Gentle washes that carry the photo's colours down the page. */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(70% 28% at 0% 32%, ${a}, transparent 70%), radial-gradient(70% 26% at 100% 55%, ${b}, transparent 70%), radial-gradient(80% 24% at 20% 85%, ${v}, transparent 70%)`,
        }}
      />
    </div>
  );
}

function ProfileChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-full border border-line bg-surface/80 px-3 py-1.5 text-sm shadow-card backdrop-blur">
      <span className="text-xs text-muted">{label}</span>
      <span className="num font-semibold text-ink">{value}</span>
    </span>
  );
}
