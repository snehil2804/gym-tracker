"use client";

import { ArrowDown, ArrowUp, CirclePlus, Copy, Sparkles, Trash2, TriangleAlert, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge, Button, Card, Chip, Choice, Field, Input, Select, Switch, Textarea, useToast, cx } from "@/components/ui";
import type { Core } from "@/lib/data/derived";
import { useExercises, useSaveAttendance, useSaveWorkout, useTemplates, useTrainers, type WorkoutPayload } from "@/lib/data/hooks";
import { formatShort } from "@/lib/domain/dates";
import { formatMoney, sessionValue } from "@/lib/domain/money";
import { parseWorkoutText, type WorkoutDraft } from "@/lib/domain/parser";
import type { Workout } from "@/lib/types";

export const MUSCLES = ["chest", "back", "shoulders", "biceps", "triceps", "quads", "hamstrings", "glutes", "calves", "core", "forearms", "cardio"];
export const WORKOUT_TYPES = [
  { value: "push", label: "Push" },
  { value: "pull", label: "Pull" },
  { value: "legs", label: "Legs" },
  { value: "chest_triceps", label: "Chest & triceps" },
  { value: "back_biceps", label: "Back & biceps" },
  { value: "shoulders", label: "Shoulders" },
  { value: "full_body", label: "Full body" },
  { value: "upper", label: "Upper body" },
  { value: "lower", label: "Lower body" },
  { value: "cardio", label: "Cardio" },
  { value: "custom", label: "Custom" },
];

interface SetRow {
  reps: string;
  weight: string;
  warmup: boolean;
}
interface ExRow {
  key: string;
  name: string;
  notes: string;
  rest: string;
  sets: SetRow[];
}

let k = 0;
const key = () => `ex-${++k}`;
const blankSet = (): SetRow => ({ reps: "", weight: "", warmup: false });

function fromWorkout(w: Workout, keepSets = true): ExRow[] {
  return w.exercises.map((e) => ({
    key: key(),
    name: e.exercise?.name ?? "",
    notes: e.notes ?? "",
    rest: e.rest_seconds ? String(e.rest_seconds) : "",
    sets: keepSets && e.sets.length
      ? e.sets.map((s) => ({ reps: s.reps == null ? "" : String(s.reps), weight: s.weight_kg == null ? "" : String(s.weight_kg), warmup: s.is_warmup }))
      : [blankSet()],
  }));
}

type PtChoice = "keep" | "pt_done" | "gym_only";

export function WorkoutEditor({ d, initial, initialDate, duplicateOf }: { d: Core; initial?: Workout; initialDate?: string; duplicateOf?: Workout }) {
  const router = useRouter();
  const toast = useToast();
  const exercises = useExercises();
  const templates = useTemplates();
  const trainers = useTrainers();
  const saveWorkout = useSaveWorkout();
  const saveAttendance = useSaveAttendance();
  const src = initial ?? duplicateOf;

  const [date, setDate] = useState(initial?.workout_date ?? initialDate ?? d.today);
  const [time, setTime] = useState(initial?.start_time?.slice(0, 5) ?? "");
  const [title, setTitle] = useState(src?.title ?? "");
  const [type, setType] = useState(src?.workout_type ?? "");
  const [muscles, setMuscles] = useState<string[]>(src?.muscle_groups ?? []);
  const [duration, setDuration] = useState(src?.duration_min ? String(src.duration_min) : "");
  const [energy, setEnergy] = useState<number | null>(initial?.energy_level ?? null);
  const [withTrainer, setWithTrainer] = useState(src?.with_trainer ?? false);
  const [cardioType, setCardioType] = useState(src?.cardio_type ?? "");
  const [cardioMin, setCardioMin] = useState(src?.cardio_min ? String(src.cardio_min) : "");
  const [distance, setDistance] = useState(src?.distance_km ? String(src.distance_km) : "");
  const [trainerNotes, setTrainerNotes] = useState(initial?.trainer_notes ?? "");
  const [personal, setPersonal] = useState(initial?.personal_notes ?? "");
  const [discomfort, setDiscomfort] = useState(initial?.discomfort_notes ?? "");
  const [rows, setRows] = useState<ExRow[]>(src ? fromWorkout(src) : []);
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<WorkoutDraft | null>(null);
  const [pt, setPt] = useState<PtChoice>("keep");
  const [showDescribe, setShowDescribe] = useState(!initial && !duplicateOf);

  const library = useMemo(() => (exercises.data ?? []).filter((e) => !e.is_archived), [exercises.data]);
  const existingAttendance = d.byDate.get(date);
  const pkg = d.activeOn(date);
  const rate = pkg ? sessionValue(1, pkg.price_paise, pkg.sessions_purchased) : 0;

  function applyDraft() {
    const dr = parseWorkoutText(text, {
      today: d.today,
      trainerNames: (trainers.data ?? []).map((t) => t.name),
      exerciseNames: library.map((e) => e.name),
    });
    setDraft(dr);
    setDate(dr.date);
    if (dr.durationMin) setDuration(String(dr.durationMin));
    if (dr.muscleGroups.length) setMuscles(dr.muscleGroups);
    if (dr.trainer) setWithTrainer(true);
    if (dr.cardio) {
      setCardioType(dr.cardio.type);
      if (dr.cardio.minutes) setCardioMin(String(dr.cardio.minutes));
      if (dr.cardio.distanceKm) setDistance(String(dr.cardio.distanceKm));
    }
    const strength = dr.exercises.filter((e) => !dr.cardio || e.name !== dr.cardio.type);
    if (strength.length) {
      setRows(
        strength.map((e) => ({
          key: key(),
          name: e.name,
          notes: "",
          rest: "",
          sets: e.sets.length ? e.sets.map((s) => ({ reps: s.reps == null ? "" : String(s.reps), weight: s.weight_kg == null ? "" : String(s.weight_kg), warmup: false })) : [blankSet()],
        })),
      );
    }
    if (!title && dr.muscleGroups.length) setTitle(dr.muscleGroups.map((m) => m[0].toUpperCase() + m.slice(1)).join(" & "));
    if (!personal) setPersonal(text.trim());
    // A PT deduction is only *suggested* for explicit statements and still needs this choice to be confirmed.
    setPt(d.ptEnabled && dr.ptSuggestion === "completed" && !d.byDate.get(dr.date) ? "pt_done" : dr.attendance === "attended" && !d.byDate.get(dr.date) ? "gym_only" : "keep");
  }

  function applyTemplate(name: string) {
    const t = templates.data?.find((x) => x.id === name);
    if (!t) return;
    setRows(t.exercise_names.map((n) => ({ key: key(), name: n, notes: "", rest: "", sets: [blankSet(), blankSet(), blankSet()] })));
    setMuscles(t.muscle_groups);
    setType(t.workout_type ?? "custom");
    if (!title) setTitle(t.name);
  }

  function repeat(id: string) {
    const w = d.workouts.find((x) => x.id === id);
    if (!w) return;
    setRows(fromWorkout(w));
    setMuscles(w.muscle_groups);
    setType(w.workout_type ?? "");
    setTitle(w.title ?? "");
    setWithTrainer(w.with_trainer);
    if (w.duration_min) setDuration(String(w.duration_min));
  }

  const update = (i: number, patch: Partial<ExRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, dir: -1 | 1) =>
    setRows((rs) => {
      const j = i + dir;
      if (j < 0 || j >= rs.length) return rs;
      const next = [...rs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const num = (s: string) => (s.trim() === "" ? null : Number(s));
  const invalid =
    rows.some((r) => r.sets.some((s) => (s.reps && !(Number(s.reps) >= 0)) || (s.weight && !(Number(s.weight) >= 0) ))) ||
    (duration !== "" && !(Number(duration) > 0 && Number(duration) <= 600));

  async function submit() {
    const payload: WorkoutPayload = {
      id: initial?.id,
      workout_date: date,
      start_time: time || null,
      title: title.trim() || null,
      workout_type: type || null,
      muscle_groups: muscles,
      duration_min: num(duration),
      cardio_type: cardioType || null,
      cardio_min: num(cardioMin),
      distance_km: num(distance),
      energy_level: energy,
      with_trainer: withTrainer,
      trainer_notes: trainerNotes || null,
      personal_notes: personal || null,
      discomfort_notes: discomfort || null,
      exercises: rows
        .filter((r) => r.name.trim())
        .map((r) => {
          const ex = library.find((e) => e.name.toLowerCase() === r.name.trim().toLowerCase());
          return {
            exercise_id: ex?.id ?? null,
            name: r.name.trim(),
            notes: r.notes || null,
            rest_seconds: num(r.rest),
            sets: r.sets.map((s) => ({ reps: num(s.reps), weight_kg: num(s.weight), is_warmup: s.warmup })),
          };
        }),
    };
    try {
      const id = await saveWorkout.mutateAsync(payload);
      if (!initial && pt !== "keep") {
        await saveAttendance.mutateAsync({
          date,
          gym_status: "attended",
          pt_status: pt === "pt_done" ? "completed" : "not_scheduled",
          source: "workout",
        });
      }
      toast.success(initial ? "Workout updated." : pt === "pt_done" ? "Workout and PT session saved." : "Workout saved.");
      router.push(`/workouts/${id}`);
    } catch (e) {
      toast.error(e);
    }
  }

  const lastWorkouts = d.workouts.filter((w) => w.id !== initial?.id).slice(0, 15);

  return (
    <div className="space-y-4 pb-10">
      {!initial && (
        <Card className="p-5">
          <button className="flex w-full items-center justify-between text-left" onClick={() => setShowDescribe((s) => !s)}>
            <span className="flex items-center gap-2 font-semibold">
              <Sparkles className="size-4 text-accent" /> Describe it in a sentence
            </span>
            <span className="text-sm text-muted">{showDescribe ? "Hide" : "Show"}</span>
          </button>
          {showDescribe && (
            <div className="mt-3 space-y-3">
              <Textarea
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="I went to the gym today. Trained chest and triceps. Soham trained me for one hour. Did bench press 3x10 at 30kg, cable fly and triceps pushdowns."
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary" size="sm" disabled={!text.trim()} onClick={applyDraft} icon={<Sparkles className="size-3.5" />}>
                  Make a draft
                </Button>
                <span className="text-xs text-muted">Works offline — nothing is saved until you press Save.</span>
              </div>
              {draft && (
                <div className="space-y-2 rounded-xl bg-surface-2 p-3 text-sm">
                  <p className="font-medium">
                    Draft for {formatShort(draft.date)}
                    {draft.dateSource === "default" ? " (today)" : ""} · {draft.exercises.length} exercises
                    {draft.durationMin ? ` · ${draft.durationMin} min` : ""}
                    {draft.trainer ? ` · with ${draft.trainer}` : ""}
                  </p>
                  {draft.ptSuggestion && !d.byDate.get(draft.date) && (
                    <p className="text-ink-2">
                      You wrote “{draft.ptEvidence}”, so a completed PT session is pre-selected below. Check it before saving.
                    </p>
                  )}
                  {draft.ptSuggestion && d.byDate.get(draft.date) && (
                    <p className="text-ink-2">This day is already logged, so your PT balance won&apos;t change. Edit it from the calendar if needed.</p>
                  )}
                  {draft.warnings.map((w) => (
                    <p key={w} className="flex gap-2 text-warn">
                      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> {w}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      <Card className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Date">
            <Input type="date" value={date} max={d.today} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Start time">
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
          <Field label="Duration (min)">
            <Input inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value.replace(/\D/g, ""))} placeholder="60" />
          </Field>
          <Field label="Type">
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">—</option>
              {WORKOUT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Chest & triceps" />
        </Field>
        <Field label="Muscle groups">
          <div className="flex flex-wrap gap-1.5">
            {MUSCLES.map((m) => (
              <Chip key={m} selected={muscles.includes(m)} onClick={() => setMuscles(muscles.includes(m) ? muscles.filter((x) => x !== m) : [...muscles, m])}>
                {m}
              </Chip>
            ))}
          </div>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          {d.ptEnabled ? (
            <Switch checked={withTrainer} onChange={setWithTrainer} label="Trained with my trainer" description="Workout detail only — PT balance is set below." />
          ) : (
            <span />
          )}
          <Field label="Energy">
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEnergy(energy === e ? null : e)}
                  aria-pressed={energy === e}
                  className={cx("h-9 flex-1 rounded-lg border text-sm font-semibold", energy === e ? "border-ink bg-primary text-primary-ink" : "border-line-strong text-ink-2")}
                >
                  {e}
                </button>
              ))}
            </div>
          </Field>
        </div>
      </Card>

      {!initial && (
        <Card className="space-y-2 p-5">
          <h2 className="font-semibold">Attendance for {formatShort(date)}</h2>
          {existingAttendance ? (
            <p className="text-sm text-muted">Already logged for this day. Change it from the calendar if needed — saving this workout won&apos;t touch it.</p>
          ) : (
            <>
              {d.ptEnabled && (
              <Choice
                selected={pt === "pt_done"}
                onClick={() => setPt("pt_done")}
                title="Gym + PT session completed"
                description={pkg ? `Uses 1 of ${pkg.remaining} sessions (${formatMoney(rate)}).` : "No active package covers this date."}
                tone="good"
              />
              )}
              <Choice selected={pt === "gym_only"} onClick={() => setPt("gym_only")} title={d.ptEnabled ? "Gym visit, no PT session" : "I went to the gym"} description={d.ptEnabled ? "Balance unchanged." : "Marks this day as a gym visit."} />
              <Choice selected={pt === "keep"} onClick={() => setPt("keep")} title="Don't record attendance" description="Just save the workout." />
            </>
          )}
        </Card>
      )}

      <Card className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Exercises</h2>
          <div className="flex flex-wrap gap-2">
            <Select className="h-9 w-auto text-sm" value="" onChange={(e) => e.target.value && applyTemplate(e.target.value)} aria-label="Start from a template">
              <option value="">Template…</option>
              {(templates.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
            {lastWorkouts.length > 0 && (
              <Select className="h-9 w-auto text-sm" value="" onChange={(e) => e.target.value && repeat(e.target.value)} aria-label="Repeat a previous workout">
                <option value="">Repeat a workout…</option>
                {lastWorkouts.map((w) => (
                  <option key={w.id} value={w.id}>
                    {formatShort(w.workout_date)} · {w.title || w.muscle_groups.join(", ") || "Workout"}
                  </option>
                ))}
              </Select>
            )}
          </div>
        </div>
        <datalist id="exercise-names">
          {library.map((e) => (
            <option key={e.id} value={e.name} />
          ))}
        </datalist>

        {rows.length === 0 && <p className="py-4 text-center text-sm text-muted">No exercises yet. Add one, pick a template, or repeat a previous workout.</p>}

        <div className="space-y-3">
          {rows.map((r, i) => {
            const known = library.some((e) => e.name.toLowerCase() === r.name.trim().toLowerCase());
            return (
              <div key={r.key} className="rounded-2xl border border-line p-3">
                <div className="flex items-center gap-2">
                  <span className="num grid size-7 shrink-0 place-items-center rounded-lg bg-surface-2 text-xs font-semibold">{i + 1}</span>
                  <Input list="exercise-names" value={r.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Exercise" className="h-10" aria-label="Exercise name" />
                  <div className="flex shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => move(i, -1)} aria-label="Move up" disabled={i === 0}>
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => move(i, 1)} aria-label="Move down" disabled={i === rows.length - 1}>
                      <ArrowDown className="size-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Remove exercise">
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
                {r.name.trim() && !known && <p className="mt-1 ml-9 text-xs text-muted">New exercise — it will be added to your library.</p>}
                <table className="mt-2 w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] tracking-wide text-muted uppercase">
                      <th className="w-9 py-1 font-semibold">Set</th>
                      <th className="py-1 font-semibold">Reps</th>
                      <th className="py-1 font-semibold">kg</th>
                      <th className="w-16 py-1 text-center font-semibold">Warm-up</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {r.sets.map((s, si) => (
                      <tr key={si}>
                        <td className="num py-1 text-muted">{si + 1}</td>
                        <td className="py-1 pr-2">
                          <Input
                            inputMode="numeric"
                            className="h-9"
                            value={s.reps}
                            aria-label={`Set ${si + 1} reps`}
                            onChange={(e) => update(i, { sets: r.sets.map((x, xi) => (xi === si ? { ...x, reps: e.target.value.replace(/\D/g, "") } : x)) })}
                          />
                        </td>
                        <td className="py-1 pr-2">
                          <Input
                            inputMode="decimal"
                            className="h-9"
                            value={s.weight}
                            aria-label={`Set ${si + 1} weight in kg`}
                            onChange={(e) => update(i, { sets: r.sets.map((x, xi) => (xi === si ? { ...x, weight: e.target.value.replace(/[^\d.]/g, "") } : x)) })}
                          />
                        </td>
                        <td className="py-1 text-center">
                          <input
                            type="checkbox"
                            className="size-4 accent-[var(--ink)]"
                            checked={s.warmup}
                            aria-label={`Set ${si + 1} is a warm-up`}
                            onChange={() => update(i, { sets: r.sets.map((x, xi) => (xi === si ? { ...x, warmup: !x.warmup } : x)) })}
                          />
                        </td>
                        <td className="py-1 text-right">
                          <button
                            type="button"
                            className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2"
                            aria-label={`Remove set ${si + 1}`}
                            onClick={() => update(i, { sets: r.sets.length > 1 ? r.sets.filter((_, xi) => xi !== si) : [blankSet()] })}
                          >
                            <X className="size-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Copy className="size-3.5" />}
                    onClick={() => update(i, { sets: [...r.sets, { ...(r.sets[r.sets.length - 1] ?? blankSet()), warmup: false }] })}
                  >
                    Add set
                  </Button>
                  <Input className="h-8 max-w-28 text-xs" inputMode="numeric" placeholder="Rest (s)" value={r.rest} onChange={(e) => update(i, { rest: e.target.value.replace(/\D/g, "") })} aria-label="Rest seconds" />
                  <Input className="h-8 min-w-0 flex-1 text-xs" placeholder="Notes" value={r.notes} onChange={(e) => update(i, { notes: e.target.value })} aria-label="Exercise notes" />
                </div>
              </div>
            );
          })}
        </div>
        <Button className="mt-3" icon={<CirclePlus className="size-4" />} onClick={() => setRows([...rows, { key: key(), name: "", notes: "", rest: "", sets: [blankSet()] }])}>
          Add exercise
        </Button>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="font-semibold">Cardio</h2>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Type">
            <Input list="cardio-types" value={cardioType} onChange={(e) => setCardioType(e.target.value)} placeholder="Treadmill" />
            <datalist id="cardio-types">
              {["Treadmill", "Cycling", "Rowing Machine", "Elliptical", "Stair Climber", "Jump Rope", "Outdoor run"].map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Minutes">
            <Input inputMode="numeric" value={cardioMin} onChange={(e) => setCardioMin(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="Distance (km)">
            <Input inputMode="decimal" value={distance} onChange={(e) => setDistance(e.target.value.replace(/[^\d.]/g, ""))} />
          </Field>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="font-semibold">Notes</h2>
        <Field label="Trainer's notes">
          <Textarea rows={2} value={trainerNotes} onChange={(e) => setTrainerNotes(e.target.value)} />
        </Field>
        <Field label="Personal notes">
          <Textarea rows={2} value={personal} onChange={(e) => setPersonal(e.target.value)} />
        </Field>
        <Field label="Pain or discomfort (optional)">
          <Textarea rows={2} value={discomfort} onChange={(e) => setDiscomfort(e.target.value)} />
        </Field>
      </Card>

      <div className="sticky bottom-20 z-10 flex items-center gap-3 rounded-2xl border border-line bg-surface/95 p-3 shadow-pop backdrop-blur md:bottom-4">
        <div className="min-w-0 flex-1 text-sm">
          <p className="truncate font-semibold">{title || "Workout"} · {formatShort(date)}</p>
          <p className="truncate text-xs text-muted">
            {rows.filter((r) => r.name.trim()).length} exercises · {rows.reduce((s, r) => s + r.sets.filter((x) => x.reps || x.weight).length, 0)} sets
            {!initial && pt === "pt_done" ? <> · <Badge tone="good">−1 PT session</Badge></> : null}
          </p>
        </div>
        <Button variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button variant="primary" loading={saveWorkout.isPending || saveAttendance.isPending} disabled={invalid} onClick={submit}>
          Save
        </Button>
      </div>
    </div>
  );
}
