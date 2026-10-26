"use client";

import { z } from "zod";
import { getSupabase } from "@/lib/supabase/client";
import { toCSV } from "@/lib/domain/csv";

/** Tables included in a full archive, in restore order. */
export const ARCHIVE_TABLES = [
  "profiles",
  "memberships",
  "trainers",
  "pt_packages",
  "pt_payments",
  "attendance",
  "pt_ledger",
  "schedule_blocks",
  "exercises",
  "workout_templates",
  "workouts",
  "workout_exercises",
  "workout_sets",
  "body_measurements",
  "goals",
  "progress_photos",
  "audit_log",
] as const;
type TableName = (typeof ARCHIVE_TABLES)[number];

async function fetchAll(table: TableName) {
  const rows: Record<string, unknown>[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await getSupabase().from(table).select("*").range(from, from + page - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < page) break;
  }
  return rows;
}

export async function buildArchive() {
  const { data: u } = await getSupabase().auth.getUser();
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const t of ARCHIVE_TABLES) tables[t] = await fetchAll(t);
  return {
    format: "gym-tracker-archive",
    version: 1,
    app: "Rep Ledger",
    exported_at: new Date().toISOString(),
    user_id: u.user?.id ?? null,
    money_unit: "paise (1 INR = 100 paise)",
    notes:
      "Complete copy of your records. Progress photo image files are NOT included (only their metadata); download them separately if you need them. Ledger entries include voided ones for reference; restore re-derives completed/missed entries from attendance.",
    tables,
  };
}

export function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const CSV_EXPORTS: { key: string; label: string; table: TableName; columns?: string[] }[] = [
  { key: "attendance", label: "Gym attendance", table: "attendance", columns: ["id", "date", "gym_status", "pt_status", "pt_package_id", "rescheduled_to", "absence_reason", "notes", "source", "created_at", "updated_at"] },
  { key: "packages", label: "PT packages", table: "pt_packages" },
  { key: "payments", label: "PT payments", table: "pt_payments" },
  { key: "ledger", label: "PT session transactions", table: "pt_ledger" },
  { key: "workouts", label: "Workout history", table: "workouts" },
  { key: "memberships", label: "Gym memberships", table: "memberships" },
  { key: "measurements", label: "Body measurements", table: "body_measurements" },
];

export async function exportCSV(key: string) {
  const spec = CSV_EXPORTS.find((c) => c.key === key)!;
  const rows = await fetchAll(spec.table);
  return toCSV(rows, spec.columns ?? (rows[0] ? Object.keys(rows[0]) : []));
}

/** One row per set, with workout and exercise context. */
export async function exportExerciseHistoryCSV() {
  const { data, error } = await getSupabase()
    .from("workout_sets")
    .select("id, set_number, reps, weight_kg, duration_sec, is_warmup, we:workout_exercises(id, position, exercise:exercises(id, name, primary_muscle), workout:workouts(id, workout_date, title))")
    .limit(100000);
  if (error) throw error;
  type Row = {
    id: string; set_number: number; reps: number | null; weight_kg: number | null; duration_sec: number | null; is_warmup: boolean;
    we: { id: string; position: number; exercise: { id: string; name: string; primary_muscle: string }; workout: { id: string; workout_date: string; title: string | null } };
  };
  const rows = ((data ?? []) as unknown as Row[]).map((r) => ({
    workout_date: r.we.workout.workout_date,
    workout_id: r.we.workout.id,
    workout_title: r.we.workout.title,
    exercise_id: r.we.exercise.id,
    exercise: r.we.exercise.name,
    primary_muscle: r.we.exercise.primary_muscle,
    exercise_position: r.we.position,
    set_number: r.set_number,
    reps: r.reps,
    weight_kg: r.weight_kg,
    duration_sec: r.duration_sec,
    is_warmup: r.is_warmup,
    set_id: r.id,
  }));
  rows.sort((a, b) => a.workout_date.localeCompare(b.workout_date) || a.workout_id.localeCompare(b.workout_id) || a.exercise_position - b.exercise_position || a.set_number - b.set_number);
  return toCSV(rows);
}

const uuid = z.string().uuid();
const row = z.object({ id: z.union([uuid, z.number()]) }).passthrough();
export const ArchiveSchema = z.object({
  format: z.literal("gym-tracker-archive"),
  version: z.literal(1),
  exported_at: z.string(),
  tables: z.object(Object.fromEntries(ARCHIVE_TABLES.map((t) => [t, z.array(row).optional()])) as Record<TableName, z.ZodOptional<z.ZodArray<typeof row>>>),
});

export function validateArchive(text: string) {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false as const, error: "The file isn't valid JSON." };
  }
  const parsed = ArchiveSchema.safeParse(json);
  if (!parsed.success) return { ok: false as const, error: `Not a valid Rep Ledger archive: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}` };
  const counts = Object.fromEntries(ARCHIVE_TABLES.map((t) => [t, parsed.data.tables[t]?.length ?? 0]));
  return { ok: true as const, archive: json as { tables: Record<string, unknown[]> }, counts };
}

export async function restoreArchive(archive: unknown) {
  const { data, error } = await getSupabase().rpc("restore_archive", { p: archive });
  if (error) throw error;
  return data as Record<string, number>;
}
