"use client";

import { ArrowLeft, ArrowRightLeft, Ban, CalendarCheck, CalendarX, Check, Dumbbell, HelpCircle, Moon, NotebookPen, UserX, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { DayBadge } from "@/components/day-status";
import { Button, Chip, Choice, Field, Input, Sheet, Textarea, useToast } from "@/components/ui";
import { useCore } from "@/lib/data/derived";
import { useDeleteAttendance, useSaveAttendance, type AttendanceInput } from "@/lib/data/hooks";
import { ABSENCE_REASONS, classifyDay, isScheduledDay, selfCancelledLabel } from "@/lib/domain/attendance";
import { addDays, formatShort, relativeDay } from "@/lib/domain/dates";
import type { AbsenceReason, Attendance } from "@/lib/types";

type Mode = "menu" | "went" | "missed" | "cancelled";
interface Ctx {
  open: (mode?: Mode, date?: string) => void;
}
const QuickLogCtx = createContext<Ctx>({ open: () => {} });
export const useQuickLog = () => useContext(QuickLogCtx);

export function QuickLogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; mode: Mode; date?: string }>({ open: false, mode: "menu" });
  const open = useCallback((mode: Mode = "menu", date?: string) => setState({ open: true, mode, date }), []);
  const value = useMemo(() => ({ open }), [open]);
  return (
    <QuickLogCtx.Provider value={value}>
      {children}
      {state.open && (
        <QuickLogSheet
          initialMode={state.mode}
          initialDate={state.date}
          onClose={() => setState((s) => ({ ...s, open: false }))}
        />
      )}
    </QuickLogCtx.Provider>
  );
}

type MissKind = "gym_only" | "pt_charged" | "both_charged" | "pt_unsure" | "self_cancelled" | "rescheduled" | "other";

function QuickLogSheet({ initialMode, initialDate, onClose }: { initialMode: Mode; initialDate?: string; onClose: () => void }) {
  const { data } = useCore();
  const router = useRouter();
  const toast = useToast();
  const save = useSaveAttendance();
  const remove = useDeleteAttendance();
  const [mode, setMode] = useState<Mode>(initialMode);
  const today = data?.today ?? "";
  const [dateState, setDate] = useState<string>(initialDate ?? "");
  const [miss, setMiss] = useState<MissKind | null>(null);
  const [reason, setReason] = useState<AbsenceReason | null>(null);
  const [note, setNote] = useState("");
  const [newDate, setNewDate] = useState("");
  const [gymToo, setGymToo] = useState(true);

  if (!data) {
    return (
      <Sheet open onClose={onClose} title="Log training">
        <p className="py-6 text-center text-sm text-muted">Loading…</p>
      </Sheet>
    );
  }

  const date = dateState || today;
  const ptOn = data.ptEnabled;
  // Without personal training a miss is simply a missed gym day.
  const missKind: MissKind | null = ptOn ? miss : "gym_only";
  const existing = data.byDate.get(date);
  const pkg = data.activeOn(date);
  const scheduled = isScheduledDay(date, pkg?.schedule_days ?? data.scheduleDays);
  const trainer = pkg?.trainer_name ?? "your trainer";

  async function commit(input: AttendanceInput, message: string) {
    const previous: Attendance | undefined = existing;
    try {
      await save.mutateAsync({ ...input, source: "quick" });
      onClose();
      toast.success(message, {
        label: "Undo",
        onClick: async () => {
          try {
            if (previous) {
              await save.mutateAsync({
                date: previous.date,
                gym_status: previous.gym_status,
                pt_status: previous.pt_status,
                pt_package_id: previous.pt_package_id,
                rescheduled_to: previous.rescheduled_to,
                absence_reason: previous.absence_reason,
                notes: previous.notes,
                source: previous.source,
              });
            } else {
              const fresh = await import("@/lib/supabase/client").then(({ getSupabase }) =>
                getSupabase().from("attendance").select("id").eq("date", input.date).single(),
              );
              if (fresh.data) await remove.mutateAsync(fresh.data.id);
            }
            toast.info("Undone.");
          } catch (e) {
            toast.error(e);
          }
        },
      });
    } catch (e) {
      toast.error(e);
    }
  }

  const dateLabel = date === today ? "today" : relativeDay(date, today).toLowerCase();

  const header = (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Chip selected={date === today} onClick={() => setDate(today)}>
          Today
        </Chip>
        <Chip selected={date === addDays(today, -1)} onClick={() => setDate(addDays(today, -1))}>
          Yesterday
        </Chip>
        <label className="relative">
          <span className="sr-only">Pick a date</span>
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="h-8 w-auto rounded-full border border-line-strong bg-surface px-3 text-[13px] text-ink-2"
          />
        </label>
      </div>
      {existing && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-[13px] text-ink-2">
          Already logged for {formatShort(date)}:
          <DayBadge kind={classifyDay(date, existing, data.dayCtx)} />
          <span className="text-muted">Saving replaces it.</span>
        </div>
      )}
    </div>
  );

  const back = (
    <button onClick={() => setMode("menu")} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
      <ArrowLeft className="size-4" /> Back
    </button>
  );

  let body: ReactNode = null;
  let footer: ReactNode = null;
  let title = "Log training";

  if (mode === "menu") {
    body = (
      <>
        {header}
        <div className="grid gap-2">
          <Choice
            icon={<Check className="size-5" />}
            tone="good"
            title={`I went ${dateLabel}`}
            description={ptOn ? "Log a gym visit and your PT session." : "Log a gym visit."}
            onClick={() => (ptOn ? setMode("went") : commit({ date, gym_status: "attended", pt_status: "not_scheduled" }, `Gym visit logged for ${formatShort(date)}.`))}
          />
          <Choice icon={<X className="size-5" />} tone="accent" title={`I missed ${dateLabel}`} description={ptOn ? "Tell us what you missed and why." : "Add a reason if you like."} onClick={() => setMode("missed")} />
          {ptOn && (
            <Choice icon={<Ban className="size-5" />} tone="info" title="Trainer cancelled" description="Not your loss — the session stays in your balance." onClick={() => setMode("cancelled")} />
          )}
          <Choice
            icon={<Moon className="size-5" />}
            tone="warn"
            title="Mark as rest day"
            description="Planned rest. No PT session is deducted."
            onClick={() => commit({ date, gym_status: "rest", pt_status: "not_scheduled" }, `Rest day saved for ${formatShort(date)}.`)}
          />
          {date === today && (
            <Choice
              icon={<NotebookPen className="size-5" />}
              title="Log today's exercises"
              description="Weights and reps for today's planned workout, on the Today page."
              onClick={() => {
                onClose();
                router.push("/#today-workout");
              }}
            />
          )}
        </div>
      </>
    );
  }

  if (mode === "went" && !ptOn) {
    title = `Went to the gym ${dateLabel}`;
    body = (
      <>
        {header}
        <Choice
          icon={<Check className="size-5" />}
          tone="good"
          title="Yes, log my gym visit"
          description="Add workout details afterwards if you like."
          onClick={() => commit({ date, gym_status: "attended", pt_status: "not_scheduled" }, `Gym visit logged for ${formatShort(date)}.`)}
        />
      </>
    );
  } else if (mode === "went") {
    title = `Went to the gym ${dateLabel}`;
    body = (
      <>
        {back}
        {header}
        <p className="mb-2 text-sm font-medium text-ink-2">Did you have a PT session with {trainer}?</p>
        <div className="grid gap-2">
          <Choice
            icon={<CalendarCheck className="size-5" />}
            tone="good"
            title="Yes — PT session done"
            description={pkg ? `Uses 1 of ${pkg.remaining} remaining sessions.` : "No active package covers this date — add one first."}
            onClick={() => commit({ date, gym_status: "attended", pt_status: "completed" }, `Gym + PT logged for ${formatShort(date)}.`)}
          />
          <Choice
            icon={<Dumbbell className="size-5" />}
            title={scheduled ? "No — trained on my own" : "No PT today (not scheduled)"}
            description={scheduled ? "Choose this only if no PT session was planned. A planned session you skipped is a miss." : "Sessions aren't scheduled on this day."}
            onClick={() => commit({ date, gym_status: "attended", pt_status: "not_scheduled" }, `Gym visit logged for ${formatShort(date)}.`)}
          />
          <Choice
            icon={<Ban className="size-5" />}
            tone="info"
            title="Trainer cancelled"
            description="I went, but the PT session didn't happen. Balance unchanged."
            onClick={() => commit({ date, gym_status: "attended", pt_status: "trainer_cancelled" }, `Logged: trainer cancelled on ${formatShort(date)}.`)}
          />
          <Choice
            icon={<CalendarX className="size-5" />}
            title={`${selfCancelledLabel(data.profile.display_name)} the PT session`}
            description="I trained, but called off PT myself. Not deducted unless the trainer charged it."
            onClick={() => commit({ date, gym_status: "attended", pt_status: "client_cancelled" }, `Logged: you cancelled PT on ${formatShort(date)}.`)}
          />
          <Choice
            icon={<HelpCircle className="size-5" />}
            title="Not sure yet"
            description="Save the gym visit; confirm the PT session later."
            onClick={() => commit({ date, gym_status: "attended", pt_status: "unverified" }, `Gym visit saved. PT left unconfirmed.`)}
          />
        </div>
      </>
    );
  }

  if (mode === "cancelled") {
    title = "Trainer cancelled";
    body = (
      <>
        {back}
        {header}
        <div className="grid gap-2">
          <Choice selected={gymToo} icon={<Dumbbell className="size-5" />} title="I still went to the gym" onClick={() => setGymToo(true)} />
          <Choice selected={!gymToo} icon={<UserX className="size-5" />} title="I didn't go to the gym" onClick={() => setGymToo(false)} />
        </div>
        <Field label="Note (optional)" className="mt-4">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Trainer was unwell" />
        </Field>
        <p className="mt-3 text-xs text-muted">Trainer cancellations never count as a missed or forfeited session.</p>
      </>
    );
    footer = (
      <Button
        variant="primary"
        block
        size="lg"
        loading={save.isPending}
        onClick={() =>
          commit(
            { date, gym_status: gymToo ? "attended" : "absent", pt_status: "trainer_cancelled", notes: note || null },
            `Trainer cancellation logged for ${formatShort(date)}.`,
          )
        }
      >
        Save
      </Button>
    );
  }

  if (mode === "missed") {
    title = `Missed ${dateLabel}`;
    const opts: { k: MissKind; title: string; desc: string; icon: ReactNode; tone?: "accent" | "info" | "violet" | "warn" }[] = [
      {
        k: "both_charged",
        title: "Gym and PT session",
        desc: pkg ? "Chargeable — uses 1 session." : "Chargeable PT absence.",
        icon: <X className="size-5" />,
        tone: "accent",
      },
      { k: "gym_only", title: "Just the gym", desc: "No PT session was scheduled. Balance unchanged.", icon: <Dumbbell className="size-5" /> },
      {
        k: "pt_charged",
        title: "Only the PT session",
        desc: "I went to the gym but missed PT. Chargeable — uses 1 session.",
        icon: <UserX className="size-5" />,
        tone: "accent",
      },
      {
        k: "pt_unsure",
        title: "PT session — not sure if charged",
        desc: "Recorded as a miss; balance untouched until you confirm.",
        icon: <HelpCircle className="size-5" />,
        tone: "warn",
      },
      {
        k: "self_cancelled",
        title: `${selfCancelledLabel(data.profile.display_name)} the session`,
        desc: "You called it off. Not deducted — if the trainer still charged it, choose a chargeable option above.",
        icon: <CalendarX className="size-5" />,
      },
      { k: "rescheduled", title: "Session was rescheduled", desc: "Moved to another day. Won't be counted twice.", icon: <ArrowRightLeft className="size-5" />, tone: "violet" },
      { k: "other", title: "Something else", desc: "Add a note; PT stays unconfirmed.", icon: <NotebookPen className="size-5" /> },
    ];
    body = (
      <>
        {back}
        {header}
        {ptOn && (
          <>
            <p className="mb-2 text-sm font-medium text-ink-2">What did you miss?</p>
            <div className="grid gap-2">
              {opts.map((o) => (
                <Choice key={o.k} selected={miss === o.k} icon={o.icon} tone={o.tone} title={o.title} description={o.desc} onClick={() => setMiss(o.k)} />
              ))}
            </div>
          </>
        )}
        {miss === "rescheduled" && (
          <Field label="Moved to" className="mt-4" hint="Log the make-up day as a completed session when it happens.">
            <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          </Field>
        )}
        {missKind && (
          <>
            <p className={`${ptOn ? "mt-5" : ""} mb-2 text-sm font-medium text-ink-2`}>Reason (optional)</p>
            <div className="flex flex-wrap gap-2">
              {ABSENCE_REASONS.map((r) => (
                <Chip key={r.value} selected={reason === r.value} onClick={() => setReason(reason === r.value ? null : r.value)}>
                  {r.label}
                </Chip>
              ))}
            </div>
            <Field label="Note (optional)" className="mt-4">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder={miss === "other" ? "What happened?" : ""} />
            </Field>
          </>
        )}
      </>
    );
    const map: Record<MissKind, Pick<AttendanceInput, "gym_status" | "pt_status">> = {
      both_charged: { gym_status: "absent", pt_status: "chargeable_absence" },
      self_cancelled: { gym_status: "absent", pt_status: "client_cancelled" },
      gym_only: { gym_status: "absent", pt_status: "not_scheduled" },
      pt_charged: { gym_status: "attended", pt_status: "chargeable_absence" },
      pt_unsure: { gym_status: "absent", pt_status: "missed_unconfirmed" },
      rescheduled: { gym_status: "absent", pt_status: "rescheduled" },
      other: { gym_status: "absent", pt_status: "unverified" },
    };
    footer = (
      <Button
        variant="primary"
        block
        size="lg"
        disabled={!missKind || (missKind === "rescheduled" && !newDate) || (missKind === "other" && !note.trim())}
        loading={save.isPending}
        onClick={() =>
          missKind &&
          commit(
            { date, ...map[missKind], absence_reason: reason, notes: note || null, rescheduled_to: missKind === "rescheduled" ? newDate : null },
            missKind === "both_charged" || missKind === "pt_charged"
              ? "Missed session recorded — 1 session used."
              : `Absence saved for ${formatShort(date)}.`,
          )
        }
      >
        Save
      </Button>
    );
  }

  return (
    <Sheet open onClose={onClose} title={title} footer={footer}>
      {body}
    </Sheet>
  );
}
