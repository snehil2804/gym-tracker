"use client";

import { ArrowLeft, Archive, CirclePlus, Pencil, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { MUSCLES, WORKOUT_TYPES } from "@/components/workout-editor";
import { Badge, Button, Card, CardHeader, Chip, ErrorNote, Field, Input, PageHeader, Segmented, Select, Sheet, Skeleton, Switch, Textarea, useToast } from "@/components/ui";
import { useDeleteTemplate, useExercises, useSaveExercise, useSaveTemplate, useTemplates } from "@/lib/data/hooks";
import type { Exercise, WorkoutTemplate } from "@/lib/types";

export default function LibraryPage() {
  const exercises = useExercises();
  const templates = useTemplates();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [edit, setEdit] = useState<Partial<Exercise> | null>(null);
  const [tpl, setTpl] = useState<Partial<WorkoutTemplate> | null>(null);

  const list = useMemo(
    () =>
      (exercises.data ?? []).filter(
        (e) =>
          (showArchived || !e.is_archived) &&
          (cat === "all" || e.primary_muscle === cat || e.category === cat) &&
          (!q || e.name.toLowerCase().includes(q.toLowerCase())),
      ),
    [exercises.data, q, cat, showArchived],
  );

  if (exercises.error) return <ErrorNote error={exercises.error} />;
  if (exercises.isLoading) return <Skeleton className="h-96" />;

  return (
    <div className="anim-rise">
      <Link href="/workouts" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Workouts
      </Link>
      <PageHeader title="Exercises & templates" actions={<Button variant="primary" icon={<CirclePlus className="size-4" />} onClick={() => setEdit({ category: "strength", primary_muscle: "chest", secondary_muscles: [] })}>New exercise</Button>} />

      <Card className="mb-6">
        <CardHeader
          title="Templates"
          action={
            <Button size="sm" variant="ghost" icon={<CirclePlus className="size-4" />} onClick={() => setTpl({ exercise_names: [], muscle_groups: [] })}>
              New
            </Button>
          }
        />
        <div className="grid gap-2 p-5 pt-3 sm:grid-cols-2 lg:grid-cols-3">
          {(templates.data ?? []).map((t) => (
            <button key={t.id} onClick={() => setTpl(t)} className="rounded-xl border border-line p-3 text-left hover:bg-surface-2/60">
              <p className="flex items-center gap-2 font-semibold">
                {t.name} {!t.is_builtin && <Badge>custom</Badge>}
              </p>
              <p className="mt-0.5 line-clamp-2 text-xs text-muted">{t.exercise_names.join(" · ")}</p>
            </button>
          ))}
        </div>
      </Card>

      <div className="mb-3 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="-mx-1 flex gap-1.5 no-scrollbar overflow-x-auto px-1 pb-1">
          {["all", ...MUSCLES].map((m) => (
            <Chip key={m} selected={cat === m} onClick={() => setCat(m)}>
              {m}
            </Chip>
          ))}
        </div>
        <Switch checked={showArchived} onChange={setShowArchived} label="Show archived" />
      </div>
      <Card className="divide-y divide-line">
        {list.map((e) => (
          <button key={e.id} onClick={() => setEdit(e)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-surface-2/50">
            <span className="min-w-0 flex-1">
              <span className="block font-medium">
                {e.name} {e.is_archived && <Badge>archived</Badge>}
              </span>
              <span className="block text-xs text-muted">
                {e.primary_muscle}
                {e.secondary_muscles.length ? ` · ${e.secondary_muscles.join(", ")}` : ""}
                {e.equipment ? ` · ${e.equipment}` : ""}
              </span>
            </span>
            <Pencil className="size-4 text-faint" />
          </button>
        ))}
        {list.length === 0 && <p className="px-5 py-6 text-center text-sm text-muted">No exercises match.</p>}
      </Card>

      {edit && <ExerciseSheet value={edit} onClose={() => setEdit(null)} />}
      {tpl && <TemplateSheet value={tpl} names={(exercises.data ?? []).map((e) => e.name)} onClose={() => setTpl(null)} />}
    </div>
  );
}

function ExerciseSheet({ value, onClose }: { value: Partial<Exercise>; onClose: () => void }) {
  const toast = useToast();
  const save = useSaveExercise();
  const [name, setName] = useState(value.name ?? "");
  const [primary, setPrimary] = useState(value.primary_muscle ?? "chest");
  const [secondary, setSecondary] = useState<string[]>(value.secondary_muscles ?? []);
  const [category, setCategory] = useState<Exercise["category"]>(value.category ?? "strength");
  const [equipment, setEquipment] = useState(value.equipment ?? "");
  const [notes, setNotes] = useState(value.notes ?? "");
  const submit = async (patch: Partial<Exercise> = {}) => {
    try {
      await save.mutateAsync({ id: value.id, name: name.trim(), primary_muscle: primary, secondary_muscles: secondary, category, equipment: equipment || null, notes: notes || null, ...patch });
      toast.success("Exercise saved.");
      onClose();
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={value.id ? "Edit exercise" : "New exercise"}
      footer={
        <div className="flex justify-between gap-2">
          {value.id ? (
            <Button variant="ghost" icon={<Archive className="size-4" />} onClick={() => submit({ is_archived: !value.is_archived })}>
              {value.is_archived ? "Restore" : "Archive"}
            </Button>
          ) : (
            <span />
          )}
          <Button variant="primary" disabled={!name.trim()} loading={save.isPending} onClick={() => submit()}>
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} data-autofocus />
        </Field>
        <Field label="Category">
          <Segmented
            value={category}
            onChange={setCategory}
            options={[
              { value: "strength", label: "Strength" },
              { value: "cardio", label: "Cardio" },
              { value: "mobility", label: "Mobility" },
              { value: "other", label: "Other" },
            ]}
          />
        </Field>
        <Field label="Primary muscle">
          <Select value={primary} onChange={(e) => setPrimary(e.target.value)}>
            {MUSCLES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
        </Field>
        <Field label="Secondary muscles">
          <div className="flex flex-wrap gap-1.5">
            {MUSCLES.filter((m) => m !== primary).map((m) => (
              <Chip key={m} selected={secondary.includes(m)} onClick={() => setSecondary(secondary.includes(m) ? secondary.filter((x) => x !== m) : [...secondary, m])}>
                {m}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="Equipment (optional)">
          <Input value={equipment} onChange={(e) => setEquipment(e.target.value)} placeholder="barbell, cable, machine…" />
        </Field>
        <Field label="Personal notes">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Seat height 4, grip width…" />
        </Field>
      </div>
    </Sheet>
  );
}

function TemplateSheet({ value, names, onClose }: { value: Partial<WorkoutTemplate>; names: string[]; onClose: () => void }) {
  const toast = useToast();
  const save = useSaveTemplate();
  const del = useDeleteTemplate();
  const [name, setName] = useState(value.name ?? "");
  const [type, setType] = useState(value.workout_type ?? "custom");
  const [list, setList] = useState<string[]>(value.exercise_names ?? []);
  const [muscles, setMuscles] = useState<string[]>(value.muscle_groups ?? []);
  const [adding, setAdding] = useState("");
  return (
    <Sheet
      open
      onClose={onClose}
      title={value.id ? value.name ?? "Template" : "New template"}
      footer={
        <div className="flex justify-between gap-2">
          {value.id ? (
            <Button
              variant="ghost"
              icon={<Trash2 className="size-4" />}
              loading={del.isPending}
              onClick={async () => {
                try {
                  await del.mutateAsync(value.id!);
                  toast.success("Template deleted.");
                  onClose();
                } catch (e) {
                  toast.error(e);
                }
              }}
            >
              Delete
            </Button>
          ) : (
            <span />
          )}
          <Button
            variant="primary"
            disabled={!name.trim() || list.length === 0}
            loading={save.isPending}
            onClick={async () => {
              try {
                await save.mutateAsync({ id: value.id, name: name.trim(), workout_type: type, exercise_names: list, muscle_groups: muscles });
                toast.success("Template saved.");
                onClose();
              } catch (e) {
                toast.error(e);
              }
            }}
          >
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {WORKOUT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
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
        <Field label="Exercises">
          <ol className="space-y-1">
            {list.map((n, i) => (
              <li key={`${n}-${i}`} className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-1.5 text-sm">
                {i + 1}. {n}
                <button className="text-muted hover:text-ink" onClick={() => setList(list.filter((_, j) => j !== i))} aria-label={`Remove ${n}`}>
                  ×
                </button>
              </li>
            ))}
          </ol>
          <div className="mt-2 flex gap-2">
            <Input list="lib-names" value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Add exercise" />
            <datalist id="lib-names">
              {names.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            <Button
              onClick={() => {
                if (adding.trim()) setList([...list, adding.trim()]);
                setAdding("");
              }}
            >
              Add
            </Button>
          </div>
        </Field>
      </div>
    </Sheet>
  );
}
