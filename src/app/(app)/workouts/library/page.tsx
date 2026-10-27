"use client";

import { Archive, ArrowLeft, CheckCircle2, CirclePlus, Loader2, Pencil, PlayCircle, Search, VideoOff } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DemoModal, demoFromCatalog, demoFromExercise, type Demo } from "@/components/planner/demo-modal";
import { Badge, Button, Card, Chip, ErrorNote, Field, Input, PageHeader, Select, Sheet, Skeleton, Switch, Textarea, cx, useToast } from "@/components/ui";
import { usePlanCatalog } from "@/lib/data/planner";
import { useExercises, useSaveExercise } from "@/lib/data/hooks";
import { MUSCLE_GROUPS, TARGET_MUSCLES, groupOf, parseShortsUrl, shortsUrl, type MuscleGroupId } from "@/lib/domain/muscles";
import type { CatalogExercise } from "@/lib/domain/planner";
import type { Exercise } from "@/lib/types";

/*
  Exercise library, grouped by muscle group. Shows your own exercises (editable) and the exercises
  from the workout plan (editing one saves your own copy — the shared plan never changes).
  Every exercise carries a YouTube Shorts demo; adding or editing requires a Shorts link.
*/

type Entry =
  | { kind: "mine"; key: string; name: string; muscle: string; equipment: string | null; archived: boolean; ex: Exercise; demo: Demo }
  | { kind: "plan"; key: string; name: string; muscle: string; equipment: string | null; archived: false; cat: CatalogExercise; demo: Demo };

export default function LibraryPage() {
  const exercises = useExercises();
  const catalog = usePlanCatalog();
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<MuscleGroupId | "all">("all");
  const [showArchived, setShowArchived] = useState(false);
  const [edit, setEdit] = useState<{ ex?: Exercise; cat?: CatalogExercise } | null>(null);
  const [demo, setDemo] = useState<Demo | null>(null);

  const entries = useMemo<Entry[]>(() => {
    const mine = (exercises.data ?? []).map<Entry>((e) => ({
      kind: "mine",
      key: e.id,
      name: e.name,
      muscle: e.primary_muscle,
      equipment: e.equipment,
      archived: e.is_archived,
      ex: e,
      demo: demoFromExercise(e),
    }));
    const have = new Set((exercises.data ?? []).flatMap((e) => [e.catalog_id ?? "", e.name.toLowerCase().trim()]));
    const plan = (catalog.data ?? [])
      .filter((c) => !have.has(c.id) && !have.has(c.name.toLowerCase().trim()))
      .map<Entry>((c) => ({ kind: "plan", key: `plan:${c.id}`, name: c.name, muscle: c.primary_muscle, equipment: c.equipment, archived: false, cat: c, demo: demoFromCatalog(c) }));
    return [...mine, ...plan].sort((a, b) => a.name.localeCompare(b.name));
  }, [exercises.data, catalog.data]);

  const needle = q.trim().toLowerCase();
  const visible = entries.filter((e) => (showArchived || !e.archived) && (!needle || e.name.toLowerCase().includes(needle) || (e.equipment ?? "").toLowerCase().includes(needle)));
  const counts = new Map<string, number>();
  for (const e of visible) counts.set(groupOf(e.muscle), (counts.get(groupOf(e.muscle)) ?? 0) + 1);
  const shownGroups = MUSCLE_GROUPS.filter((g) => (group === "all" || g.id === group) && (counts.get(g.id) ?? 0) > 0);

  if (exercises.error || catalog.error) return <ErrorNote error={exercises.error || catalog.error} />;
  if (exercises.isLoading || catalog.isLoading) return <Skeleton className="h-96" />;

  return (
    <div className="anim-rise">
      <Link href="/workouts" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Workouts
      </Link>
      <PageHeader
        title="Exercise library"
        subtitle="Pick a muscle group to see its exercises. Every exercise has a YouTube Shorts demo."
        actions={
          <Button variant="primary" icon={<CirclePlus className="size-4" />} onClick={() => setEdit({})}>
            Add exercise
          </Button>
        }
      />

      <div className="mb-4 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Search exercises or equipment" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="-mx-1 flex gap-1.5 no-scrollbar overflow-x-auto px-1 pb-1" role="tablist" aria-label="Muscle groups">
          <Chip selected={group === "all"} onClick={() => setGroup("all")}>
            All · {visible.length}
          </Chip>
          {MUSCLE_GROUPS.filter((g) => (counts.get(g.id) ?? 0) > 0 || ["chest", "back", "shoulders", "biceps", "triceps", "legs", "core"].includes(g.id)).map((g) => (
            <Chip key={g.id} selected={group === g.id} onClick={() => setGroup(g.id)}>
              {g.label} · {counts.get(g.id) ?? 0}
            </Chip>
          ))}
        </div>
        <Switch checked={showArchived} onChange={setShowArchived} label="Show archived" />
      </div>

      {shownGroups.length === 0 && <Card className="p-8 text-center text-sm text-muted">No exercises here yet. Use “Add exercise” to create one.</Card>}
      <div className="space-y-6">
        {shownGroups.map((g) => (
          <section key={g.id}>
            <h2 className="mb-2 text-[13px] font-semibold tracking-[0.06em] text-muted uppercase">
              {g.label} · {counts.get(g.id)}
            </h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {visible
                .filter((e) => groupOf(e.muscle) === g.id)
                .map((e) => (
                  <div key={e.key} className={cx("flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-card", e.archived && "opacity-60")}>
                    <button
                      type="button"
                      onClick={() => setDemo(e.demo)}
                      className={cx("grid size-12 shrink-0 place-items-center rounded-xl", e.demo.videoId ? "bg-teal-soft text-teal hover:bg-teal hover:text-white" : "bg-surface-2 text-faint")}
                      aria-label={`Demo: ${e.name}`}
                      title={e.demo.videoId ? "Watch the demo (starts muted)" : "No demo yet"}
                    >
                      {e.demo.videoId ? <PlayCircle className="size-6" /> : <VideoOff className="size-5" />}
                    </button>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{e.name}</span>
                      <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
                        {TARGET_MUSCLES.find((t) => t.value === e.muscle)?.label ?? e.muscle}
                        {e.equipment && <span className="truncate">· {e.equipment}</span>}
                        {e.kind === "plan" && <Badge tone="info">plan</Badge>}
                        {e.archived && <Badge>archived</Badge>}
                      </span>
                    </span>
                    <Button size="sm" variant="ghost" icon={<Pencil className="size-4" />} onClick={() => setEdit(e.kind === "mine" ? { ex: e.ex } : { cat: e.cat })} aria-label={`Edit ${e.name}`}>
                      Edit
                    </Button>
                  </div>
                ))}
            </div>
          </section>
        ))}
      </div>

      {edit && <ExerciseSheet ex={edit.ex} cat={edit.cat} taken={(exercises.data ?? []).map((e) => e.name.toLowerCase().trim())} onClose={() => setEdit(null)} />}
      <DemoModal demo={demo} onClose={() => setDemo(null)} />
    </div>
  );
}

type OEmbed = { title: string; author_name: string; width: number; height: number };

/** Looks up a Short with YouTube's public oEmbed endpoint (title, channel, embeddable). */
function useShortInfo(id: string | null) {
  const [state, setState] = useState<{ id: string; info: OEmbed | null; checked: boolean } | null>(null);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(shortsUrl(id))}`)
      .then(async (r) => {
        if (!alive) return;
        // 401/403 = embedding disabled, 404 = no such video
        if (!r.ok) setState({ id, info: null, checked: true });
        else setState({ id, info: (await r.json()) as OEmbed, checked: true });
      })
      .catch(() => alive && setState({ id, info: null, checked: false })); // offline / blocked: can't check
    return () => {
      alive = false;
    };
  }, [id]);
  return id && state?.id === id ? state : null;
}

function ExerciseSheet({ ex, cat, taken, onClose }: { ex?: Exercise; cat?: CatalogExercise; taken: string[]; onClose: () => void }) {
  const toast = useToast();
  const save = useSaveExercise();
  const [name, setName] = useState(ex?.name ?? cat?.name ?? "");
  const [muscle, setMuscle] = useState(ex?.primary_muscle ?? cat?.primary_muscle ?? "chest");
  const [url, setUrl] = useState(ex?.video_url ?? (cat?.video_url && cat.video_status === "verified" ? cat.video_url : "") ?? "");
  const [equipment, setEquipment] = useState((ex?.equipment ?? cat?.equipment ?? "").slice(0, 40));
  const [notes, setNotes] = useState(ex?.notes ?? cat?.instructions ?? "");
  const videoId = parseShortsUrl(url);
  const info = useShortInfo(videoId);
  const clash = !ex && taken.includes(name.trim().toLowerCase());
  const urlError = !url.trim()
    ? "A YouTube Shorts link is required."
    : !videoId
      ? "Use a YouTube Shorts link (youtube.com/shorts/…), not a regular video."
      : info?.checked && !info.info
        ? "That Short doesn't exist or can't be played inside other apps."
        : info?.info && info.info.width > info.info.height
          ? "That looks like a regular (landscape) video, not a Short."
          : null;
  const invalid = !name.trim() || name.trim().length > 80 || clash || !!urlError;

  const submit = async (patch: Partial<Exercise> = {}) => {
    try {
      await save.mutateAsync({
        id: ex?.id,
        name: name.trim(),
        primary_muscle: muscle,
        category: muscle === "cardio" ? "cardio" : (ex?.category ?? "strength"),
        equipment: equipment.trim() || null,
        notes: notes.trim() || null,
        video_id: videoId,
        video_title: info?.info?.title ?? (videoId === ex?.video_id ? ex?.video_title : null) ?? null,
        video_creator: info?.info?.author_name ?? (videoId === ex?.video_id ? ex?.video_creator : null) ?? null,
        ...(cat && !ex ? { catalog_id: cat.id } : {}),
        ...patch,
      });
      toast.success(ex ? "Exercise updated." : cat ? "Saved as your own version of this exercise." : "Exercise added.");
      onClose();
    } catch (e) {
      const msg = String((e as { message?: string })?.message ?? e);
      toast.error(msg.includes("exercises_user_name_uidx") ? "You already have an exercise with that name." : e);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={ex ? "Edit exercise" : cat ? "Edit plan exercise" : "Add exercise"}
      description={cat && !ex ? "Saving creates your own version — the shared plan isn't changed." : undefined}
      footer={
        <div className="flex justify-between gap-2">
          {ex ? (
            <Button variant="ghost" icon={<Archive className="size-4" />} onClick={() => submit({ is_archived: !ex.is_archived })} disabled={!!urlError}>
              {ex.is_archived ? "Restore" : "Archive"}
            </Button>
          ) : (
            <span />
          )}
          <Button variant="primary" disabled={invalid} loading={save.isPending} onClick={() => submit()}>
            {ex ? "Save changes" : "Add exercise"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pb-2">
        <Field label="Exercise name" error={clash ? "You already have an exercise with that name." : undefined}>
          <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cable lateral raise" data-autofocus />
        </Field>
        <Field label="Target muscle group">
          <Select value={muscle} onChange={(e) => setMuscle(e.target.value)}>
            {TARGET_MUSCLES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="YouTube Shorts demo link (required)" error={url ? urlError ?? undefined : undefined} hint={!url ? "Paste a link like https://www.youtube.com/shorts/…" : undefined}>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/shorts/…" inputMode="url" autoComplete="off" />
        </Field>
        {videoId && !urlError && (
          <p className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-xs text-ink-2">
            {info?.info ? (
              <>
                <CheckCircle2 className="size-4 shrink-0 text-good" /> “{info.info.title}” — {info.info.author_name}
              </>
            ) : info ? (
              <>Couldn&apos;t check the video right now — it will be saved as entered.</>
            ) : (
              <>
                <Loader2 className="size-4 animate-spin" /> Checking the Short…
              </>
            )}
          </p>
        )}
        <Field label="Equipment (optional)">
          <Input value={equipment} maxLength={40} onChange={(e) => setEquipment(e.target.value)} placeholder="barbell, cable, machine…" />
        </Field>
        <Field label="Cues / notes (optional)">
          <Textarea rows={3} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Seat height 4, elbows tucked…" />
        </Field>
      </div>
    </Sheet>
  );
}
