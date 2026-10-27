"use client";

import { CalendarDays, Copy, FilePlus2, ListPlus, Moon, Pencil, Plus, Save, Search, Sparkles, Trash2, Undo2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CardioPanel, MobilityPanel, StepsPanel, WarmupPanel } from "@/components/planner/activity-panels";
import { DemoModal } from "@/components/planner/demo-modal";
import { ExerciseCard } from "@/components/planner/exercise-card";
import { Badge, Button, ConfirmSheet, ErrorNote, Input, LinkButton, Segmented, Select, Sheet, Skeleton, Switch, cx, useToast } from "@/components/ui";
import {
  useDefaultTemplate,
  useDeletePlan,
  usePlanCatalog,
  usePlannerSettings,
  useSavePlan,
  useSavePlannerSettings,
  useWorkoutPlans,
  type PlannerSettings,
  type WorkoutPlan,
} from "@/lib/data/planner";
import { useUser } from "@/lib/data/hooks";
import { isoWeekday } from "@/lib/domain/dates";
import {
  WEEKDAYS,
  blankDays,
  buildDefaultDays,
  copyOfDefault,
  dayLabel,
  defaultItemKey,
  freeItem,
  itemFromCatalog,
  moveItem,
  serialisePlan,
  validatePlan,
  type CatalogExercise,
  type DefaultOverrides,
  type PlanDay,
  type PlanItem,
} from "@/lib/domain/planner";

/*
  The planner on the Workouts page.
  - Default plan: the shared template (read-only) + your own sets/reps per exercise.
  - Custom plans: any number of named 7-day plans. Edits are drafts until saved; drafts survive
    switching plans, leaving the page and reloading (kept in this browser), and the page warns
    before closing with unsaved changes.
*/

type Draft = { id: string | null; name: string; days: PlanDay[]; saved: string | null }; // saved = serialised last-saved state
/** Drafts are stored per account, so people sharing a browser never see each other's. */
const draftsKey = (uid: string) => `rl-planner-drafts-v1:${uid}`;
const NEW = "__new__";

function readDrafts(uid: string): Record<string, Draft> {
  try {
    return JSON.parse(localStorage.getItem(draftsKey(uid)) ?? "{}");
  } catch {
    return {};
  }
}
function writeDrafts(uid: string, d: Record<string, Draft>) {
  try {
    localStorage.setItem(draftsKey(uid), JSON.stringify(d));
  } catch {}
}
const isDirty = (d: Draft) => d.saved === null || serialisePlan(d.days) + d.name !== d.saved;

export function WorkoutPlanner({ today }: { today: string }) {
  const catalogQ = usePlanCatalog();
  const templateQ = useDefaultTemplate();
  const settingsQ = usePlannerSettings();
  const plansQ = useWorkoutPlans();
  const userQ = useUser();
  const error = catalogQ.error || templateQ.error || settingsQ.error || plansQ.error;
  if (error) return <ErrorNote error={error} />;
  if (!catalogQ.data || !templateQ.data || !settingsQ.data || !plansQ.data || !userQ.data) return <PlannerSkeleton />;
  return <Planner key={userQ.data.id} uid={userQ.data.id} today={today} catalog={catalogQ.data} template={templateQ.data} settings={settingsQ.data} plans={plansQ.data} />;
}

function PlannerSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-12" />
      <Skeleton className="h-10" />
      <Skeleton className="h-40" />
      <Skeleton className="h-40" />
    </div>
  );
}

function Planner({
  uid,
  today,
  catalog,
  template,
  settings,
  plans,
}: {
  uid: string;
  today: string;
  catalog: CatalogExercise[];
  template: NonNullable<ReturnType<typeof useDefaultTemplate>["data"]>;
  settings: PlannerSettings;
  plans: WorkoutPlan[];
}) {
  const toast = useToast();
  const saveSettings = useSavePlannerSettings();
  const savePlan = useSavePlan();
  const deletePlan = useDeletePlan();
  const catalogMap = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);
  const defaultDays = useMemo(() => buildDefaultDays(template.days, template.items, settings.default_overrides), [template, settings.default_overrides]);
  const todayWd = isoWeekday(today);

  const activePlan = plans.find((p) => p.id === settings.active_plan_id) ?? null;
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => (typeof window === "undefined" ? {} : readDrafts(uid)));
  // Unsaved work reopens where it was left: the first plan with a pending draft.
  const pendingDraft = Object.entries(drafts).find(([id, d]) => isDirty(d) && (id === NEW || plans.some((p) => p.id === id)))?.[0] ?? null;
  const [mode, setMode] = useState<"default" | "custom">(activePlan || pendingDraft ? "custom" : "default");
  const [weekday, setWeekday] = useState(todayWd);
  const [demo, setDemo] = useState<CatalogExercise | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(pendingDraft ?? activePlan?.id ?? plans[0]?.id ?? null);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [adding, setAdding] = useState(false);

  // Keep drafts in this browser so they survive navigation and reloads.
  useEffect(() => writeDrafts(uid, drafts), [uid, drafts]);
  const anyDirty = Object.values(drafts).some(isDirty);
  useEffect(() => {
    if (!anyDirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [anyDirty]);

  // The plan being edited: a draft if there is one, otherwise the saved plan.
  const savedSel = plans.find((p) => p.id === selectedId);
  const draft: Draft | null = selectedId
    ? drafts[selectedId] ?? (savedSel ? { id: savedSel.id, name: savedSel.name, days: savedSel.days, saved: serialisePlan(savedSel.days) + savedSel.name } : null)
    : null;
  const dirty = draft ? isDirty(draft) : false;
  const update = (patch: Partial<Draft>) => {
    if (!draft || !selectedId) return;
    setDrafts((all) => ({ ...all, [selectedId]: { ...draft, ...patch } }));
  };
  const updateDay = (wd: number, fn: (d: PlanDay) => PlanDay) => draft && update({ days: draft.days.map((d) => (d.weekday === wd ? fn(d) : d)) });

  const days = mode === "default" ? defaultDays : (draft?.days ?? null);
  const day = days?.find((d) => d.weekday === weekday) ?? null;
  const todayPlanDay = (mode === "custom" && activePlan ? activePlan.days : defaultDays).find((d) => d.weekday === todayWd)!;

  // --- actions ---------------------------------------------------------------
  const switchMode = (m: "default" | "custom") => {
    setMode(m);
    if (m === "default") saveSettings.mutate({ active_plan_id: null }, { onError: (e) => toast.error(e) });
    else if (selectedId && plans.some((p) => p.id === selectedId)) saveSettings.mutate({ active_plan_id: selectedId }, { onError: (e) => toast.error(e) });
  };
  const choosePlan = (id: string) => {
    setSelectedId(id);
    if (plans.some((p) => p.id === id)) saveSettings.mutate({ active_plan_id: id }, { onError: (e) => toast.error(e) });
  };
  const createPlan = (name: string, start: "default" | "blank") => {
    const d: Draft = { id: null, name, days: start === "default" ? copyOfDefault(defaultDays) : blankDays(), saved: null };
    setDrafts((all) => ({ ...all, [NEW]: d }));
    setSelectedId(NEW);
    setCreating(false);
  };
  const save = async () => {
    if (!draft) return;
    const errors = validatePlan(draft.name, draft.days);
    if (errors.length) return toast.error(errors.slice(0, 3).join(" "));
    try {
      const row = await savePlan.mutateAsync({ id: draft.id ?? undefined, name: draft.name, days: draft.days });
      setDrafts((all) => {
        const next = { ...all };
        delete next[selectedId!];
        return next;
      });
      setSelectedId(row.id);
      await saveSettings.mutateAsync({ active_plan_id: row.id });
      toast.success(`“${row.name}” saved and set as your active plan.`);
    } catch (e) {
      const msg = String((e as { message?: string })?.message ?? e);
      toast.error(msg.includes("workout_plans_user_name_uidx") ? "You already have a plan with that name." : e);
    }
  };
  const discard = () => {
    if (!selectedId) return;
    setDrafts((all) => {
      const next = { ...all };
      delete next[selectedId];
      return next;
    });
    if (selectedId === NEW) setSelectedId(plans[0]?.id ?? null);
  };
  const remove = async () => {
    if (!draft?.id) return discard();
    try {
      await deletePlan.mutateAsync(draft.id);
      discard();
      setSelectedId(plans.find((p) => p.id !== draft.id)?.id ?? null);
      if (settings.active_plan_id === draft.id) setMode("default");
      toast.success("Plan deleted.");
    } catch (e) {
      toast.error(e);
    }
    setConfirmDelete(false);
  };
  const setDefaultCustom = (item: PlanItem, custom: PlanItem["custom"]) => {
    const next: DefaultOverrides = { ...settings.default_overrides };
    if (custom) next[item.key] = custom;
    else delete next[item.key];
    saveSettings.mutate({ default_overrides: next }, { onError: (e) => toast.error(e), onSuccess: () => toast.success(custom ? "Your sets/reps saved." : "Back to the prescription.") });
  };

  const options = [
    ...plans.map((p) => ({ id: p.id, name: p.name })),
    ...(drafts[NEW] ? [{ id: NEW, name: `${drafts[NEW].name} (new)` }] : []),
  ];

  return (
    <div className="space-y-4">
      {/* Plan source */}
      <div className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-good uppercase">Training plan</p>
            <h2 className="font-display text-xl font-semibold tracking-tight">{mode === "default" ? template.name : (draft?.name ?? "Custom plan")}</h2>
          </div>
          <Segmented
            ariaLabel="Plan type"
            value={mode}
            onChange={switchMode}
            options={[
              { value: "default", label: "Default plan" },
              { value: "custom", label: "Custom plan" },
            ]}
          />
        </div>
        {mode === "default" ? (
          <p className="mt-2 text-sm text-muted">
            {template.description} You can set your own sets and reps per exercise — the prescription itself never changes.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {options.length > 0 && (
              <Select className="h-10 w-auto min-w-48 max-w-full flex-1 sm:flex-none" value={selectedId ?? ""} onChange={(e) => choosePlan(e.target.value)} aria-label="Saved plans">
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                    {drafts[o.id] && isDirty(drafts[o.id]) && o.id !== NEW ? " • unsaved" : ""}
                  </option>
                ))}
              </Select>
            )}
            <Button size="sm" icon={<FilePlus2 className="size-4" />} onClick={() => setCreating(true)} className="h-10">
              New plan
            </Button>
            {draft && (
              <>
                <Button size="sm" variant="ghost" className="h-10" icon={<Pencil className="size-4" />} onClick={() => setRenaming(true)}>
                  Rename
                </Button>
                <Button size="sm" variant="ghost" className="h-10 text-accent" icon={<Trash2 className="size-4" />} onClick={() => setConfirmDelete(true)}>
                  Delete
                </Button>
              </>
            )}
          </div>
        )}
        {mode === "custom" && dirty && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warn/30 bg-warn-soft px-3 py-2">
            <p className="text-sm font-medium text-warn">Unsaved changes — they&apos;re kept in this browser until you save or discard.</p>
            <span className="flex gap-2">
              <Button size="sm" variant="ghost" icon={<Undo2 className="size-4" />} onClick={discard}>
                Discard
              </Button>
              <Button size="sm" variant="primary" icon={<Save className="size-4" />} loading={savePlan.isPending} onClick={save}>
                Save plan
              </Button>
            </span>
          </div>
        )}
      </div>

      {mode === "custom" && !draft ? (
        <div className="rounded-2xl border border-dashed border-line-strong bg-surface p-8 text-center">
          <ListPlus className="mx-auto size-8 text-muted" />
          <p className="mt-2 font-semibold">No custom plans yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">Start from a copy of the default plan and change what you like, or build a week from scratch.</p>
          <Button variant="primary" className="mt-4" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            Create a plan
          </Button>
        </div>
      ) : (
        days &&
        day && (
          <>
            {/* Day tabs (Mon–Sun) */}
            <nav aria-label="Days" className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {days.map((d) => (
                <button
                  key={d.weekday}
                  type="button"
                  onClick={() => setWeekday(d.weekday)}
                  aria-pressed={weekday === d.weekday}
                  className={cx(
                    "flex min-w-[84px] shrink-0 flex-col items-start rounded-xl border px-3 py-2 text-left transition-colors",
                    weekday === d.weekday ? "border-transparent bg-primary text-primary-ink shadow-card" : "border-line bg-surface hover:bg-surface-2",
                  )}
                >
                  <span className="flex items-center gap-1 text-[11px] font-semibold uppercase opacity-70">
                    {WEEKDAYS[d.weekday - 1].slice(0, 3)}
                    {d.weekday === todayWd && <span className={cx("rounded px-1 text-[9px]", weekday === d.weekday ? "bg-white/20" : "bg-good-soft text-good")}>today</span>}
                  </span>
                  <span className="truncate text-sm font-semibold">{d.rest ? "Rest" : d.title}</span>
                </button>
              ))}
            </nav>

            {/* Day header */}
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                {mode === "custom" ? (
                  <Input
                    className="h-10 max-w-xs font-display text-lg font-semibold"
                    value={day.title}
                    maxLength={40}
                    onChange={(e) => updateDay(day.weekday, (d) => ({ ...d, title: e.target.value }))}
                    aria-label={`${WEEKDAYS[day.weekday - 1]} title`}
                  />
                ) : (
                  <h3 className="font-display text-2xl font-semibold tracking-tight">
                    {WEEKDAYS[day.weekday - 1]} · {day.title}
                  </h3>
                )}
                <p className="mt-1 text-sm text-muted">{[day.focus, dayLabel(day)].filter(Boolean).join(" · ")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {mode === "custom" && (
                  <div className="w-44">
                    <Switch
                      checked={day.rest}
                      onChange={(v) => updateDay(day.weekday, (d) => ({ ...d, rest: v, title: v ? "Rest day" : d.title === "Rest day" ? `Day ${d.weekday}` : d.title }))}
                      label="Rest day"
                    />
                  </div>
                )}
                {!day.rest && day.weekday === todayWd && (
                  <LinkButton href="/#today-workout" variant="primary" size="sm" icon={<CalendarDays className="size-4" />}>
                    Log today&apos;s session
                  </LinkButton>
                )}
              </div>
            </div>

            {/* Exercises */}
            {day.rest && day.items.length === 0 ? (
              <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-5 shadow-card">
                <span className="grid size-11 place-items-center rounded-xl bg-rest-soft text-rest">
                  <Moon className="size-5" />
                </span>
                <div>
                  <p className="font-semibold">Rest from lifting</p>
                  <p className="text-sm text-muted">{day.focus ?? "Steps, Zone 2 cardio if it's scheduled, and the posture routine."}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {day.items.map((item, i) => (
                  <ExerciseCard
                    key={item.key}
                    index={i}
                    item={item}
                    exercise={item.exerciseId ? catalogMap.get(item.exerciseId) : undefined}
                    editable={mode === "custom"}
                    onDemo={() => item.exerciseId && setDemo(catalogMap.get(item.exerciseId) ?? null)}
                    onCustom={mode === "default" ? (c) => setDefaultCustom(item, c) : undefined}
                    onChange={(next) => updateDay(day.weekday, (d) => ({ ...d, items: d.items.map((x) => (x.key === item.key ? next : x)) }))}
                    onRemove={() => updateDay(day.weekday, (d) => ({ ...d, items: d.items.filter((x) => x.key !== item.key) }))}
                    onMove={(dir) => updateDay(day.weekday, (d) => ({ ...d, items: moveItem(d.items, i, i + dir) }))}
                    canMoveUp={i > 0}
                    canMoveDown={i < day.items.length - 1}
                  />
                ))}
              </div>
            )}
            {mode === "custom" && (
              <Button block icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
                Add exercise to {WEEKDAYS[day.weekday - 1]}
              </Button>
            )}
          </>
        )
      )}

      {/* Today */}
      <section className="space-y-3 pt-2">
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.08em] text-teal uppercase">Today · {WEEKDAYS[todayWd - 1]}</p>
            <h2 className="font-display text-xl font-semibold tracking-tight">{todayPlanDay.rest ? "Rest day activity" : `${todayPlanDay.title} day`}</h2>
          </div>
          <Badge tone={todayPlanDay.rest ? "rest" : "good"} icon={<Sparkles className="size-3" />}>
            {todayPlanDay.rest ? "No lifting" : "Lifting day"}
          </Badge>
        </div>
        {!todayPlanDay.rest && <WarmupPanel date={today} day={todayPlanDay} catalog={catalogMap} />}
        <CardioPanel date={today} weekday={todayWd} settings={settings} />
        <StepsPanel date={today} settings={settings} />
        <MobilityPanel date={today} restDay={todayPlanDay.rest} />
      </section>

      <DemoModal exercise={demo} onClose={() => setDemo(null)} />
      <NewPlanSheet open={creating} onClose={() => setCreating(false)} onCreate={createPlan} taken={plans.map((p) => p.name.toLowerCase())} />
      {draft && (
        <RenameSheet
          open={renaming}
          name={draft.name}
          onClose={() => setRenaming(false)}
          onSave={(n) => {
            update({ name: n });
            setRenaming(false);
          }}
        />
      )}
      <ConfirmSheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title={`Delete “${draft?.name}”?`} onConfirm={remove} loading={deletePlan.isPending}>
        The plan is removed for good. Your logged workouts and the default plan aren&apos;t affected.
      </ConfirmSheet>
      {draft && day && (
        <AddExerciseSheet
          open={adding}
          onClose={() => setAdding(false)}
          catalog={catalog}
          dayName={WEEKDAYS[day.weekday - 1]}
          onAdd={(item) => {
            updateDay(day.weekday, (d) => ({ ...d, rest: false, title: d.rest && d.title === "Rest day" ? `Day ${d.weekday}` : d.title, items: [...d.items, item] }));
            toast.success("Exercise added — remember to save the plan.");
          }}
        />
      )}
    </div>
  );
}

function NewPlanSheet({ open, onClose, onCreate, taken }: { open: boolean; onClose: () => void; onCreate: (name: string, start: "default" | "blank") => void; taken: string[] }) {
  const [name, setName] = useState("My plan");
  const [start, setStart] = useState<"default" | "blank">("default");
  const clash = taken.includes(name.trim().toLowerCase());
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New plan"
      description="Plans are private to you. The default plan is never changed."
      footer={
        <Button variant="primary" block disabled={!name.trim() || clash} onClick={() => onCreate(name.trim(), start)}>
          Create plan
        </Button>
      }
    >
      <div className="space-y-4 pb-2">
        <label className="block text-sm font-medium text-ink-2">
          Name
          <Input className="mt-1.5" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </label>
        {clash && <p className="text-xs text-accent">You already have a plan with that name.</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["default", "Copy of the default", "All 5 days and exercises, ready to tweak", <Copy key="c" className="size-5" />],
              ["blank", "Start blank", "Seven empty days to fill in", <FilePlus2 key="b" className="size-5" />],
            ] as const
          ).map(([v, t, s, icon]) => (
            <button
              key={v}
              type="button"
              onClick={() => setStart(v)}
              aria-pressed={start === v}
              className={cx("flex items-start gap-3 rounded-2xl border p-4 text-left", start === v ? "border-ink bg-surface-2" : "border-line hover:bg-surface-2")}
            >
              <span className="text-ink-2">{icon}</span>
              <span>
                <span className="block font-semibold">{t}</span>
                <span className="block text-xs text-muted">{s}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

function RenameSheet({ open, name, onClose, onSave }: { open: boolean; name: string; onClose: () => void; onSave: (n: string) => void }) {
  const [v, setV] = useState(name);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Rename plan"
      footer={
        <Button variant="primary" block disabled={!v.trim()} onClick={() => onSave(v.trim())}>
          Rename
        </Button>
      }
    >
      <Input value={v} maxLength={60} onChange={(e) => setV(e.target.value)} aria-label="Plan name" />
      <p className="mt-2 pb-2 text-xs text-muted">Save the plan afterwards to keep the new name.</p>
    </Sheet>
  );
}

function AddExerciseSheet({ open, onClose, catalog, dayName, onAdd }: { open: boolean; onClose: () => void; catalog: CatalogExercise[]; dayName: string; onAdd: (i: PlanItem) => void }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const results = catalog.filter(
    (c) => !needle || c.name.toLowerCase().includes(needle) || c.target_muscles.some((m) => m.toLowerCase().includes(needle)) || c.equipment.toLowerCase().includes(needle),
  );
  return (
    <Sheet open={open} onClose={onClose} title={`Add to ${dayName}`} description="Search by exercise, muscle or equipment.">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <Input autoFocus className="pl-9" placeholder="e.g. lateral raise, chest, cable" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ul className="mt-3 max-h-[50vh] divide-y divide-line overflow-y-auto pb-2">
        {results.map((c) => (
          <li key={c.id}>
            <button type="button" className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-surface-2" onClick={() => onAdd(itemFromCatalog(c))}>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{c.name}</span>
                <span className="block truncate text-xs text-muted">
                  {c.target_muscles.join(", ")} · {c.equipment}
                </span>
              </span>
              <Plus className="size-4 shrink-0 text-muted" />
            </button>
          </li>
        ))}
        {needle && (
          <li>
            <button type="button" className="flex w-full items-center gap-3 py-2.5 text-left text-sm hover:bg-surface-2" onClick={() => onAdd(freeItem(q))}>
              <Plus className="size-4 text-good" /> Add “{q.trim()}” as your own exercise
            </button>
          </li>
        )}
        {!results.length && !needle && <li className="py-6 text-center text-sm text-muted">No exercises.</li>}
      </ul>
    </Sheet>
  );
}

export { defaultItemKey };
