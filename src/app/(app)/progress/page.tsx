"use client";

import { Camera, CirclePlus, EyeOff, LineChart as LineIcon, Lock, Target, Trash2, Trophy } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Bars, ChartCard, Lines, RankBars } from "@/components/charts";
import { PhotoEditor } from "@/components/photo-editor";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmSheet,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  LinkButton,
  PageHeader,
  ProgressBar,
  Segmented,
  Select,
  Sheet,
  Skeleton,
  Stat,
  useToast,
} from "@/components/ui";
import { useCore, type Core } from "@/lib/data/derived";
import {
  MAX_PHOTO_BYTES,
  useDeleteGoal,
  useDeleteMeasurement,
  useDeletePhoto,
  useExercises,
  useGoals,
  useMeasurements,
  usePhotos,
  useSaveGoal,
  useSaveMeasurement,
  useSignedPhotoUrls,
  useUploadPhoto,
} from "@/lib/data/hooks";
import { addDays, formatDate, monthName, startOfWeek } from "@/lib/domain/dates";
import {
  currentStreak,
  exerciseHistory,
  gymAttendance,
  muscleGroupCounts,
  personalRecords,
  ptAttendance,
  weeklySeries,
  workoutsBetween,
} from "@/lib/domain/stats";
import type { Goal, Measurement, ProgressPhoto } from "@/lib/types";
import { groupLabel, groupOf } from "@/lib/domain/muscles";
import { setsByGroup, weeklyLoad } from "@/lib/domain/session";

type Tab = "training" | "strength" | "body" | "goals" | "photos";
const shortDate = (iso: string) => `${Number(iso.slice(8))} ${monthName(iso, false)}`;

export default function ProgressPage() {
  const { data: d, loading, error, workoutsLoading } = useCore();
  const [tab, setTab] = useState<Tab>("training");
  if (error) return <ErrorNote error={error} />;
  if (loading || workoutsLoading || !d) return <Skeleton className="h-96" />;
  return (
    <div className="anim-rise">
      <PageHeader title="Progress" subtitle="Every chart is built from records you saved — nothing is estimated or filled in." />
      <div className="-mx-1 mb-5 no-scrollbar overflow-x-auto px-1">
        <Segmented
          className="min-w-max"
          value={tab}
          onChange={setTab}
          options={[
            { value: "training", label: "Training" },
            { value: "strength", label: "Strength" },
            { value: "body", label: "Body" },
            { value: "goals", label: "Goals" },
            { value: "photos", label: "Photos" },
          ]}
        />
      </div>
      {tab === "training" && <Training d={d} />}
      {tab === "strength" && <Strength d={d} />}
      {tab === "body" && <Body d={d} />}
      {tab === "goals" && <Goals d={d} />}
      {tab === "photos" && <Photos d={d} />}
    </div>
  );
}

/** Analytics from the weights and reps logged on the Today page (and any other logged workout). */
function LoggedTraining({ d }: { d: Core }) {
  const load = weeklyLoad(d.workouts, d.today, 12);
  const thisWeek = load.at(-1)!;
  const lastWeek = load.at(-2)!;
  const muscles = setsByGroup(d.workouts, addDays(d.today, -27), d.today, (m) => groupLabel(groupOf(m)));
  const done = load.reduce((n, w) => n + w.done, 0);
  const skipped = load.reduce((n, w) => n + w.skipped, 0);
  const wk = (iso: string) => `wk ${shortDate(iso)}`;
  const delta = (a: number, b: number) => (b ? `${a >= b ? "+" : ""}${Math.round(((a - b) / b) * 100)}% vs last week` : "first week logged");
  return (
    <>
      <Card glow="info" className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
        <Stat label="Volume this week" value={`${thisWeek.volume.toLocaleString("en-IN")} kg`} hint={delta(thisWeek.volume, lastWeek.volume)} />
        <Stat label="Working sets this week" value={thisWeek.sets} hint={`${thisWeek.reps} reps`} />
        <Stat label="Plan exercises done" value={thisWeek.done} hint={thisWeek.skipped ? `${thisWeek.skipped} skipped this week` : "none skipped this week"} />
        <Stat label="Completion (12 wks)" value={done + skipped ? `${Math.round((done / (done + skipped)) * 100)}%` : "—"} hint={`${done} done · ${skipped} skipped`} />
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Volume per week" subtitle="Weight × reps of working sets — warm-ups excluded" table={{ columns: ["Week of", "Volume (kg)", "Sets", "Reps"], rows: load.map((w) => [formatDate(w.week), w.volume, w.sets, w.reps]) }}>
          <Bars data={load} x="week" xFormat={shortDate} labelFormat={wk} format={(v) => `${v.toLocaleString("en-IN")} kg`} bars={[{ key: "volume", name: "Volume", color: "var(--chart-good)" }]} />
        </ChartCard>
        <ChartCard
          title="Plan exercises completed"
          subtitle="From the Today logger — done vs skipped"
          legend={[
            { label: "Done", color: "var(--chart-good)" },
            { label: "Skipped", color: "var(--chart-loss)", hatch: true },
          ]}
          table={{ columns: ["Week of", "Done", "Skipped"], rows: load.map((w) => [formatDate(w.week), w.done, w.skipped]) }}
        >
          <Bars
            data={load}
            x="week"
            xFormat={shortDate}
            labelFormat={wk}
            stacked
            bars={[
              { key: "done", name: "Done", color: "var(--chart-good)" },
              { key: "skipped", name: "Skipped", color: "var(--chart-loss)", hatch: true },
            ]}
          />
        </ChartCard>
      </div>
      <Card className="p-5">
        <p className="text-[15px] font-semibold">Working sets per muscle group</p>
        <p className="mb-4 text-xs text-muted">Last 4 weeks · the plan aims for about 10+ hard sets a week per major muscle</p>
        {muscles.length ? <RankBars items={muscles.map((m) => ({ label: m.group, value: m.sets }))} /> : <p className="text-sm text-muted">Log sets with reps to see this.</p>}
      </Card>
    </>
  );
}

function Training({ d }: { d: Core }) {
  const weeks = weeklySeries(d.workouts, d.attendance, d.today, 12);
  const muscles = muscleGroupCounts(workoutsBetween(d.workouts, addDays(d.today, -90), d.today)).slice(0, 10);
  const all = gymAttendance(d.attendance, d.trackingStart ?? "2000-01-01", d.today);
  const pt = ptAttendance(d.attendance, d.trackingStart ?? "2000-01-01", d.today);
  const hasAttendance = weeks.some((w) => w.gymDays + w.missed > 0);
  const hasWorkouts = d.workouts.length > 0;
  const wk = (iso: string) => `wk ${shortDate(iso)}`;

  return (
    <div className="space-y-4">
      <Card glow="good" className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
        <Stat label="Gym attendance" value={all.rate === null ? "—" : `${Math.round(all.rate * 100)}%`} hint={`${all.attended} attended · ${all.missed} missed (confirmed)`} />
        {d.ptEnabled && <Stat label="PT attendance" value={pt.rate === null ? "—" : `${Math.round(pt.rate * 100)}%`} hint={`${pt.completed} done · ${pt.charged} missed`} />}
        <Stat label="Workouts logged" value={d.workouts.length} />
        <Stat label="Current streak" value={currentStreak(d.attendance, d.today, [1, 2, 3, 4, 5, 6, 7].filter((x) => !d.scheduleDays.includes(x)))} hint="confirmed training days" />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {hasAttendance ? (
          <ChartCard
            title="Gym attendance per week"
            subtitle="Confirmed days only — unknown days are left out, not counted as missed"
            legend={[
              { label: "Attended", color: "var(--chart-good)" },
              { label: "Missed", color: "var(--chart-loss)", hatch: true },
            ]}
            table={{ columns: ["Week of", "Attended", "Missed"], rows: weeks.map((w) => [formatDate(w.week), w.gymDays, w.missed]) }}
          >
            <Bars
              data={weeks}
              x="week"
              xFormat={shortDate}
              labelFormat={wk}
              stacked
              bars={[
                { key: "gymDays", name: "Attended", color: "var(--chart-good)" },
                { key: "missed", name: "Missed", color: "var(--chart-loss)", hatch: true },
              ]}
            />
          </ChartCard>
        ) : (
          <Card>
            <EmptyState icon={<LineIcon className="size-5" />} title="No confirmed attendance yet">
              Log or review days to see weekly attendance.
            </EmptyState>
          </Card>
        )}
        {hasWorkouts ? (
          <ChartCard title="Workouts per week" subtitle="Last 12 weeks" table={{ columns: ["Week of", "Workouts", "Minutes"], rows: weeks.map((w) => [formatDate(w.week), w.workouts, w.minutes]) }}>
            <Bars data={weeks} x="week" xFormat={shortDate} labelFormat={wk} bars={[{ key: "workouts", name: "Workouts", color: "var(--chart-ink)" }]} />
          </ChartCard>
        ) : (
          <Card>
            <EmptyState icon={<LineIcon className="size-5" />} title="No workouts yet" action={<LinkButton href="/#today-workout">Log today&apos;s workout</LinkButton>}>
              Workout frequency appears after your first logged session.
            </EmptyState>
          </Card>
        )}
      </div>

      {hasWorkouts && <LoggedTraining d={d} />}

      {hasWorkouts && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Training minutes per week" table={{ columns: ["Week of", "Minutes"], rows: weeks.map((w) => [formatDate(w.week), w.minutes]) }}>
            <Bars data={weeks} x="week" xFormat={shortDate} labelFormat={wk} format={(v) => `${v} min`} bars={[{ key: "minutes", name: "Minutes", color: "var(--chart-ink)" }]} />
          </ChartCard>
          <Card className="p-5">
            <p className="text-[15px] font-semibold">Muscle groups trained</p>
            <p className="mb-4 text-xs text-muted">Workouts that hit each group, last 90 days</p>
            {muscles.length ? <RankBars items={muscles.map((m) => ({ label: m.group, value: m.count }))} /> : <p className="text-sm text-muted">No muscle groups recorded yet.</p>}
          </Card>
        </div>
      )}
    </div>
  );
}

function Strength({ d }: { d: Core }) {
  const prs = personalRecords(d.workouts);
  const [exId, setExId] = useState<string>(prs[0]?.exerciseId ?? "");
  const history = useMemo(() => (exId ? exerciseHistory(d.workouts, exId) : []), [d.workouts, exId]);
  if (prs.length === 0)
    return (
      <Card>
        <EmptyState icon={<Trophy className="size-5" />} title="No strength data yet" action={<LinkButton href="/#today-workout" variant="primary">Log today&apos;s workout</LinkButton>}>
          Log exercises with weights (e.g. bench press 3×10 at 30 kg) and your progression appears here.
        </EmptyState>
      </Card>
    );
  const pr = prs.find((p) => p.exerciseId === exId);
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-4 p-5">
        <Field label="Exercise" className="min-w-56 flex-1">
          <Select value={exId} onChange={(e) => setExId(e.target.value)}>
            {prs.map((p) => (
              <option key={p.exerciseId} value={p.exerciseId}>
                {p.name} ({p.sessions})
              </option>
            ))}
          </Select>
        </Field>
        {pr && (
          <>
            <Stat label="Best" value={`${pr.weight} kg`} hint={`${pr.reps} reps · ${formatDate(pr.date)}`} />
            <Stat label="Change" value={`${pr.weight - pr.firstWeight >= 0 ? "+" : ""}${pr.weight - pr.firstWeight} kg`} hint={`from ${pr.firstWeight} kg`} tone={pr.weight > pr.firstWeight ? "good" : undefined} />
          </>
        )}
      </Card>
      {history.length >= 2 ? (
        <ChartCard
          title={`${pr?.name} — top working set`}
          subtitle="Heaviest non-warm-up set per session, with estimated 1-rep max (Epley)"
          legend={[
            { label: "Top set (kg)", color: "var(--chart-ink)" },
            { label: "Est. 1RM (kg)", color: "var(--chart-good)" },
          ]}
          table={{ columns: ["Date", "Top set", "Reps", "Est. 1RM", "Volume"], rows: history.map((h) => [formatDate(h.date), `${h.topWeight} kg`, h.topReps, `${h.bestE1rm} kg`, `${h.volume} kg`]) }}
        >
          <Lines
            data={history}
            x="date"
            xFormat={shortDate}
            format={(v) => `${v} kg`}
            lines={[
              { key: "topWeight", name: "Top set", color: "var(--chart-ink)" },
              { key: "bestE1rm", name: "Est. 1RM", color: "var(--chart-good)", dashed: true },
            ]}
          />
        </ChartCard>
      ) : (
        <Card className="p-5 text-sm text-muted">Log this exercise at least twice to see a trend.</Card>
      )}
      <Card>
        <CardHeader title="Personal records" />
        <div className="overflow-x-auto px-5 pb-4">
          <table className="mt-2 w-full min-w-[480px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-2 font-semibold">Exercise</th>
                <th className="py-2 font-semibold">Best</th>
                <th className="py-2 font-semibold">First</th>
                <th className="py-2 font-semibold">Sessions</th>
                <th className="py-2 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody className="num divide-y divide-line">
              {prs.map((p) => (
                <tr key={p.exerciseId}>
                  <td className="py-2 font-medium">{p.name}</td>
                  <td className="py-2">
                    {p.weight} kg × {p.reps}
                  </td>
                  <td className="py-2 text-muted">{p.firstWeight} kg</td>
                  <td className="py-2">{p.sessions}</td>
                  <td className="py-2 text-muted">{formatDate(p.date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

const METRICS = [
  { value: "Body weight", unit: "kg" },
  { value: "Waist", unit: "cm" },
  { value: "Chest", unit: "cm" },
  { value: "Arms", unit: "cm" },
  { value: "Thighs", unit: "cm" },
  { value: "Body fat", unit: "%" },
];

function Body({ d }: { d: Core }) {
  const ms = useMeasurements();
  const toast = useToast();
  const save = useSaveMeasurement();
  const del = useDeleteMeasurement();
  const metrics = useMemo(() => [...new Set([...METRICS.map((m) => m.value), ...(ms.data ?? []).map((m) => m.metric)])], [ms.data]);
  const [metric, setMetric] = useState("Body weight");
  const [custom, setCustom] = useState("");
  const [value, setValue] = useState("");
  const [on, setOn] = useState(d.today);
  const [toDelete, setToDelete] = useState<Measurement | null>(null);
  const name = metric === "__custom" ? custom.trim() : metric;
  const unit = METRICS.find((m) => m.value === name)?.unit ?? (ms.data ?? []).find((m) => m.metric === name)?.unit ?? "cm";
  const series = (ms.data ?? []).filter((m) => m.metric === (metric === "__custom" ? custom.trim() : metric));

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <p className="mb-3 font-semibold">Add a measurement</p>
        <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-end">
          <Field label="Measurement">
            <Select value={metric} onChange={(e) => setMetric(e.target.value)}>
              {metrics.map((m) => (
                <option key={m}>{m}</option>
              ))}
              <option value="__custom">Other…</option>
            </Select>
          </Field>
          {metric === "__custom" && (
            <Field label="Name">
              <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="e.g. Calves" />
            </Field>
          )}
          <Field label={`Value (${unit})`}>
            <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ""))} />
          </Field>
          <Field label="Date">
            <Input type="date" max={d.today} value={on} onChange={(e) => setOn(e.target.value)} />
          </Field>
          <Button
            variant="primary"
            disabled={!name || !(Number(value) > 0)}
            loading={save.isPending}
            onClick={async () => {
              try {
                await save.mutateAsync({ measured_on: on, metric: name, value: Number(value), unit, note: null });
                setValue("");
                toast.success("Measurement saved.");
              } catch (e) {
                toast.error(e);
              }
            }}
          >
            Save
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted">One value per measurement per day — saving again for the same day replaces it.</p>
      </Card>

      {series.length >= 2 ? (
        <ChartCard title={`${name} over time`} table={{ columns: ["Date", name], rows: series.map((s) => [formatDate(s.measured_on), `${s.value} ${s.unit}`]) }}>
          <Lines data={series.map((s) => ({ date: s.measured_on, value: Number(s.value) }))} x="date" xFormat={shortDate} format={(v) => `${v} ${unit}`} lines={[{ key: "value", name, color: "var(--chart-ink)" }]} />
        </ChartCard>
      ) : (
        <Card className="p-5 text-sm text-muted">{series.length === 1 ? "Add a second entry to see a trend." : `No ${name.toLowerCase() || "measurement"} entries yet. Measurements are optional.`}</Card>
      )}

      {(ms.data ?? []).length > 0 && (
        <Card>
          <CardHeader title="All entries" />
          <ul className="divide-y divide-line px-5 pb-2">
            {[...(ms.data ?? [])].reverse().map((m) => (
              <li key={m.id} className="flex items-center justify-between py-2.5 text-sm">
                <span>
                  <span className="font-medium">{m.metric}</span> <span className="text-muted">· {formatDate(m.measured_on)}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="num font-semibold">
                    {m.value} {m.unit}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setToDelete(m)} aria-label="Delete entry">
                    <Trash2 className="size-3.5" />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <ConfirmSheet
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Delete this measurement?"
        loading={del.isPending}
        onConfirm={async () => {
          await del.mutateAsync(toDelete!.id).catch(toast.error);
          setToDelete(null);
        }}
      >
        {toDelete && `${toDelete.metric}: ${toDelete.value} ${toDelete.unit} on ${formatDate(toDelete.measured_on)}`}
      </ConfirmSheet>
    </div>
  );
}

function goalProgress(g: Goal, d: Core, measurements: Measurement[]): { current: number | null; label: string } {
  const target = g.target_value ?? 0;
  switch (g.kind) {
    case "weekly_attendance": {
      const ws = startOfWeek(d.today);
      const days = gymAttendance(d.attendance, ws, addDays(ws, 6)).attended;
      return { current: days, label: `${days} of ${target} days this week` };
    }
    case "workout_count": {
      const n = workoutsBetween(d.workouts, g.start_date, g.end_date ?? d.today).length;
      return { current: n, label: `${n} of ${target} workouts since ${formatDate(g.start_date)}` };
    }
    case "exercise_weight": {
      const best = g.exercise_id ? Math.max(0, ...exerciseHistory(d.workouts, g.exercise_id).map((h) => h.topWeight)) : 0;
      return { current: best, label: `Best ${best} kg of ${target} kg` };
    }
    case "streak": {
      const s = currentStreak(d.attendance, d.today, [1, 2, 3, 4, 5, 6, 7].filter((x) => !d.scheduleDays.includes(x)));
      return { current: s, label: `${s} of ${target} days in a row` };
    }
    case "measurement": {
      const latest = measurements.filter((m) => m.metric === g.metric).at(-1);
      return { current: latest ? Number(latest.value) : null, label: latest ? `Latest ${latest.value} ${latest.unit} · target ${target}` : "No entries yet" };
    }
    default:
      return { current: null, label: "Track this one yourself" };
  }
}

function Goals({ d }: { d: Core }) {
  const goals = useGoals();
  const ms = useMeasurements();
  const exercises = useExercises();
  const save = useSaveGoal();
  const del = useDeleteGoal();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Goal["kind"]>("weekly_attendance");
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("5");
  const [exId, setExId] = useState("");
  const [metric, setMetric] = useState("Body weight");

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="primary" icon={<CirclePlus className="size-4" />} onClick={() => setOpen(true)}>
          New goal
        </Button>
      </div>
      {(goals.data ?? []).length === 0 ? (
        <Card>
          <EmptyState icon={<Target className="size-5" />} title="No goals yet">
            Try “Attend the gym 5 days a week” or “Bench press 40 kg”.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(goals.data ?? []).map((g) => {
            const p = goalProgress(g, d, ms.data ?? []);
            const target = g.target_value ?? 0;
            const pct = p.current !== null && target > 0 ? Math.min(p.current / target, 1) : 0;
            return (
              <Card key={g.id} className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{g.title}</p>
                  <Button size="sm" variant="ghost" aria-label="Delete goal" onClick={() => del.mutateAsync(g.id).catch(toast.error)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
                <p className="mt-1 text-sm text-muted">{p.label}</p>
                {g.kind !== "custom" && g.kind !== "measurement" && (
                  <ProgressBar className="mt-3" total={1} segments={[{ value: pct, className: pct >= 1 ? "bg-good" : "bg-ink", label: "Progress" }]} label={`${Math.round(pct * 100)}%`} />
                )}
                {pct >= 1 && <Badge tone="good" className="mt-2">Reached</Badge>}
              </Card>
            );
          })}
        </div>
      )}
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="New goal"
        footer={
          <Button
            variant="primary"
            block
            loading={save.isPending}
            disabled={!title.trim() || (kind !== "custom" && !(Number(target) > 0)) || (kind === "exercise_weight" && !exId)}
            onClick={async () => {
              try {
                await save.mutateAsync({
                  kind,
                  title: title.trim(),
                  target_value: kind === "custom" ? null : Number(target),
                  exercise_id: kind === "exercise_weight" ? exId : null,
                  metric: kind === "measurement" ? metric : null,
                  start_date: d.today,
                });
                setOpen(false);
                setTitle("");
                toast.success("Goal added.");
              } catch (e) {
                toast.error(e);
              }
            }}
          >
            Add goal
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="Type">
            <Select value={kind} onChange={(e) => setKind(e.target.value as Goal["kind"])}>
              <option value="weekly_attendance">Gym days per week</option>
              <option value="workout_count">Number of workouts</option>
              <option value="exercise_weight">Lift a weight</option>
              <option value="streak">Training streak</option>
              <option value="measurement">Body measurement</option>
              <option value="custom">Something else</option>
            </Select>
          </Field>
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Attend the gym 5 days a week" />
          </Field>
          {kind === "exercise_weight" && (
            <Field label="Exercise">
              <Select value={exId} onChange={(e) => setExId(e.target.value)}>
                <option value="">Choose…</option>
                {(exercises.data ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {kind === "measurement" && (
            <Field label="Measurement">
              <Select value={metric} onChange={(e) => setMetric(e.target.value)}>
                {METRICS.map((m) => (
                  <option key={m.value}>{m.value}</option>
                ))}
              </Select>
            </Field>
          )}
          {kind !== "custom" && (
            <Field label="Target">
              <Input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^\d.]/g, ""))} />
            </Field>
          )}
        </div>
      </Sheet>
    </div>
  );
}

function Photos({ d }: { d: Core }) {
  const photos = usePhotos();
  const urls = useSignedPhotoUrls(photos.data);
  const upload = useUploadPhoto();
  const del = useDeletePhoto();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [on, setOn] = useState(d.today);
  const [hidden, setHidden] = useState(true);
  const [toDelete, setToDelete] = useState<ProgressPhoto | null>(null);
  const [editing, setEditing] = useState<File | null>(null);

  return (
    <div className="space-y-4">
      {editing && (
        <PhotoEditor
          file={editing}
          title="Progress photo"
          allowOriginal
          busy={upload.isPending}
          onCancel={() => setEditing(null)}
          onDone={async (f) => {
            try {
              await upload.mutateAsync({ file: f, takenOn: on });
              setEditing(null);
              toast.success("Photo saved privately.");
            } catch (err) {
              toast.error(err);
            }
          }}
        />
      )}
      <Card className="p-5">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Photo date">
            <Input type="date" max={d.today} value={on} onChange={(e) => setOn(e.target.value)} />
          </Field>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              if (!f.type.startsWith("image/")) return toast.error("Choose an image file.");
              if (f.size > MAX_PHOTO_BYTES) return toast.error("Photos must be under 40 MB.");
              setEditing(f); // crop & rotate first
            }}
          />
          <Button variant="primary" icon={<Camera className="size-4" />} loading={upload.isPending} onClick={() => fileRef.current?.click()}>
            Add photo
          </Button>
          {(photos.data ?? []).length > 0 && (
            <Button variant="ghost" icon={<EyeOff className="size-4" />} onClick={() => setHidden((h) => !h)}>
              {hidden ? "Show photos" : "Hide photos"}
            </Button>
          )}
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
          <Lock className="size-3.5" /> Up to 40 MB each. Stored in a private bucket only your account can read. Images load through links that expire after 10 minutes. Optional.
        </p>
      </Card>
      {(photos.data ?? []).length === 0 ? (
        <Card>
          <EmptyState icon={<Camera className="size-5" />} title="No progress photos">
            Photos are optional and private to you.
          </EmptyState>
        </Card>
      ) : hidden ? (
        <Card className="p-5 text-sm text-muted">{photos.data!.length} private photos hidden. Tap “Show photos” to view.</Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {photos.data!.map((p) => (
            <figure key={p.id} className="overflow-hidden rounded-2xl border border-line bg-surface">
              {urls.data?.[p.storage_path] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={urls.data[p.storage_path]} alt={`Progress photo ${formatDate(p.taken_on)}`} className="aspect-[3/4] w-full bg-surface-2 object-contain" />
              ) : (
                <div className="aspect-[3/4] w-full animate-pulse bg-surface-2" />
              )}
              <figcaption className="flex items-center justify-between px-3 py-2 text-xs">
                {formatDate(p.taken_on)}
                <button aria-label="Delete photo" className="text-muted hover:text-accent" onClick={() => setToDelete(p)}>
                  <Trash2 className="size-3.5" />
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      <ConfirmSheet
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Delete this photo permanently?"
        loading={del.isPending}
        onConfirm={async () => {
          try {
            await del.mutateAsync(toDelete!);
            toast.success("Photo deleted.");
          } catch (e) {
            toast.error(e);
          }
          setToDelete(null);
        }}
      >
        The image file is removed from storage and cannot be recovered.
      </ConfirmSheet>
    </div>
  );
}
