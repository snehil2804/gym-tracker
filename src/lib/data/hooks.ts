"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { todayIn } from "@/lib/domain/dates";
import type {
  Attendance,
  AuditEntry,
  Exercise,
  Goal,
  LedgerEntry,
  Measurement,
  Membership,
  PackageSummary,
  Payment,
  Profile,
  ProgressPhoto,
  ScheduleBlock,
  Trainer,
  Workout,
  WorkoutTemplate,
} from "@/lib/types";

const sb = () => getSupabase();

async function unwrap<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data as T;
}

export const keys = {
  profile: ["profile"] as const,
  memberships: ["memberships"] as const,
  trainers: ["trainers"] as const,
  packages: ["packages"] as const,
  payments: ["payments"] as const,
  attendance: ["attendance"] as const,
  ledger: ["ledger"] as const,
  blocks: ["blocks"] as const,
  exercises: ["exercises"] as const,
  templates: ["templates"] as const,
  workouts: ["workouts"] as const,
  measurements: ["measurements"] as const,
  goals: ["goals"] as const,
  photos: ["photos"] as const,
  audit: ["audit"] as const,
  user: ["user"] as const,
};

/** Everything that depends on PT sessions or money. */
const SESSION_KEYS = [keys.attendance, keys.ledger, keys.packages, keys.audit];

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
export function useUser() {
  return useQuery({
    queryKey: keys.user,
    queryFn: async () => {
      const { data, error } = await sb().auth.getUser();
      if (error) throw error;
      return data.user;
    },
    staleTime: Infinity,
  });
}

export function useProfile() {
  return useQuery({
    queryKey: keys.profile,
    queryFn: () => unwrap<Profile>(sb().from("profiles").select("*").single()),
  });
}

export function useMemberships() {
  return useQuery({
    queryKey: keys.memberships,
    queryFn: () => unwrap<Membership[]>(sb().from("memberships").select("*").order("start_date", { ascending: false })),
  });
}

export function useTrainers() {
  return useQuery({
    queryKey: keys.trainers,
    queryFn: () => unwrap<Trainer[]>(sb().from("trainers").select("*").order("name")),
  });
}

export function usePackages() {
  return useQuery({
    queryKey: keys.packages,
    queryFn: () => unwrap<PackageSummary[]>(sb().from("package_summary").select("*").order("start_date", { ascending: false })),
  });
}

export function usePayments() {
  return useQuery({
    queryKey: keys.payments,
    queryFn: () => unwrap<Payment[]>(sb().from("pt_payments").select("*").order("paid_on", { ascending: false, nullsFirst: true })),
  });
}

export function useAttendance() {
  return useQuery({
    queryKey: keys.attendance,
    queryFn: () => unwrap<Attendance[]>(sb().from("attendance").select("*").order("date", { ascending: false }).limit(5000)),
  });
}

export function useLedger() {
  return useQuery({
    queryKey: keys.ledger,
    queryFn: () => unwrap<LedgerEntry[]>(sb().from("pt_ledger").select("*").order("created_at", { ascending: false }).limit(5000)),
  });
}

export function useBlocks() {
  return useQuery({
    queryKey: keys.blocks,
    queryFn: () => unwrap<ScheduleBlock[]>(sb().from("schedule_blocks").select("*").order("start_date", { ascending: false })),
  });
}

export function useExercises() {
  return useQuery({
    queryKey: keys.exercises,
    queryFn: () => unwrap<Exercise[]>(sb().from("exercises").select("*").order("name")),
    staleTime: 5 * 60_000,
  });
}

export function useTemplates() {
  return useQuery({
    queryKey: keys.templates,
    queryFn: () => unwrap<WorkoutTemplate[]>(sb().from("workout_templates").select("*").order("is_builtin", { ascending: false }).order("name")),
    staleTime: 5 * 60_000,
  });
}

const WORKOUT_SELECT =
  "*, exercises:workout_exercises(id, exercise_id, position, rest_seconds, notes, exercise:exercises(id, name, primary_muscle, category), sets:workout_sets(id, set_number, reps, weight_kg, duration_sec, is_warmup))";

function normaliseWorkout(w: Workout): Workout {
  return {
    ...w,
    exercises: [...(w.exercises ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((e) => ({
        ...e,
        sets: [...(e.sets ?? [])]
          .sort((a, b) => a.set_number - b.set_number)
          .map((s) => ({ ...s, weight_kg: s.weight_kg == null ? null : Number(s.weight_kg) })),
      })),
  };
}

export function useWorkouts() {
  return useQuery({
    queryKey: keys.workouts,
    queryFn: async () => {
      const rows = await unwrap<Workout[]>(
        sb().from("workouts").select(WORKOUT_SELECT).order("workout_date", { ascending: false }).order("created_at", { ascending: false }).limit(2000),
      );
      return rows.map(normaliseWorkout);
    },
  });
}

export function useMeasurements() {
  return useQuery({
    queryKey: keys.measurements,
    queryFn: () => unwrap<Measurement[]>(sb().from("body_measurements").select("*").order("measured_on")),
  });
}

export function useGoals() {
  return useQuery({
    queryKey: keys.goals,
    queryFn: () => unwrap<Goal[]>(sb().from("goals").select("*").order("created_at", { ascending: false })),
  });
}

export function usePhotos() {
  return useQuery({
    queryKey: keys.photos,
    queryFn: () => unwrap<ProgressPhoto[]>(sb().from("progress_photos").select("*").order("taken_on", { ascending: false })),
  });
}

export function useAudit(limit = 300) {
  return useQuery({
    queryKey: [...keys.audit, limit],
    queryFn: () => unwrap<AuditEntry[]>(sb().from("audit_log").select("*").order("created_at", { ascending: false }).limit(limit)),
  });
}

/** Today's date in the user's time zone; re-evaluates when the tab regains focus and at midnight. */
export function useToday(): string {
  const { data: profile } = useProfile();
  const tz = profile?.timezone ?? "Asia/Kolkata";
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const id = setInterval(bump, 60_000);
    document.addEventListener("visibilitychange", bump);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", bump);
    };
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => todayIn(tz), [tz, tick]);
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------
function useInvalidate() {
  const qc = useQueryClient();
  return (...ks: readonly (readonly string[])[]) => Promise.all(ks.map((k) => qc.invalidateQueries({ queryKey: k })));
}

export type AttendanceInput = Pick<Attendance, "date" | "gym_status" | "pt_status"> &
  Partial<Pick<Attendance, "pt_package_id" | "rescheduled_to" | "absence_reason" | "notes" | "source">>;

/** Creates or updates the single attendance record for a date. Ledger entries follow automatically in the database. */
export function useSaveAttendance() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: AttendanceInput) => {
      const row = {
        date: input.date,
        gym_status: input.gym_status,
        pt_status: input.pt_status,
        pt_package_id: input.pt_package_id ?? null,
        rescheduled_to: input.pt_status === "rescheduled" ? input.rescheduled_to ?? null : null,
        absence_reason: input.absence_reason ?? null,
        notes: input.notes ?? null,
        source: input.source ?? "manual",
      };
      return unwrap<Attendance>(sb().from("attendance").upsert(row, { onConflict: "user_id,date" }).select().single());
    },
    onSuccess: () => invalidate(...SESSION_KEYS),
  });
}

export function useSaveAttendanceBatch() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (rows: AttendanceInput[]) => {
      // One row at a time so a failure (e.g. package exhausted) names the date it happened on.
      const done: string[] = [];
      for (const r of rows) {
        const { error } = await sb()
          .from("attendance")
          .upsert(
            {
              date: r.date,
              gym_status: r.gym_status,
              pt_status: r.pt_status,
              pt_package_id: r.pt_package_id ?? null,
              absence_reason: r.absence_reason ?? null,
              notes: r.notes ?? null,
              source: r.source ?? "manual",
            },
            { onConflict: "user_id,date" },
          );
        if (error) throw Object.assign(new Error(`${r.date}: ${error.message}`), { done });
        done.push(r.date);
      }
      return done;
    },
    onSettled: () => invalidate(...SESSION_KEYS),
  });
}

export function useDeleteAttendance() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => unwrap(sb().from("attendance").delete().eq("id", id)),
    onSuccess: () => invalidate(...SESSION_KEYS),
  });
}

export function useCreatePackage() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => unwrap<string>(sb().rpc("create_package", { p: payload })),
    onSuccess: () => invalidate(keys.packages, keys.payments, keys.trainers, keys.audit),
  });
}

export function useUpdatePackage() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      unwrap(sb().from("pt_packages").update(patch).eq("id", id)),
    onSuccess: () => invalidate(keys.packages, keys.audit),
  });
}

export function useDeletePackage() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => unwrap(sb().from("pt_packages").delete().eq("id", id)),
    onSuccess: () => invalidate(keys.packages, keys.payments, keys.ledger, keys.audit),
  });
}

export function useClosePackage() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (a: { id: string; closedOn: string; treatment: string; targetId?: string | null; note?: string }) =>
      unwrap(
        sb().rpc("close_package", {
          p_package_id: a.id,
          p_closed_on: a.closedOn,
          p_treatment: a.treatment,
          p_target_package_id: a.targetId ?? undefined,
          p_note: a.note ?? undefined,
        }),
      ),
    onSuccess: () => invalidate(keys.packages, keys.ledger, keys.audit),
  });
}

export function useSessionAdjustment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (a: { packageId: string; kind: "credit" | "refund" | "adjustment"; sessions: number; note?: string; date?: string }) =>
      unwrap<string>(
        sb().rpc("record_session_adjustment", {
          p_package_id: a.packageId,
          p_kind: a.kind,
          p_sessions: a.sessions,
          p_note: a.note ?? undefined,
          p_date: a.date ?? undefined,
        }),
      ),
    onSuccess: () => invalidate(keys.packages, keys.ledger, keys.audit),
  });
}

export function useVoidAdjustment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (a: { id: string; reason: string }) =>
      unwrap(sb().rpc("void_session_adjustment", { p_entry_id: a.id, p_reason: a.reason })),
    onSuccess: () => invalidate(keys.packages, keys.ledger, keys.audit),
  });
}

export function useSavePayment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (p: Partial<Payment> & { package_id: string }) => {
      const row = {
        package_id: p.package_id,
        kind: p.kind ?? "payment",
        amount_paise: p.amount_paise,
        status: p.status ?? "paid",
        paid_on: p.status === "pending" ? null : p.paid_on ?? null,
        due_on: p.due_on ?? null,
        method: p.method ?? null,
        note: p.note ?? null,
      };
      if (p.id) return unwrap(sb().from("pt_payments").update(row).eq("id", p.id));
      return unwrap(sb().from("pt_payments").insert(row));
    },
    onSuccess: () => invalidate(keys.payments, keys.packages, keys.audit),
  });
}

export function useDeletePayment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => unwrap(sb().from("pt_payments").delete().eq("id", id)),
    onSuccess: () => invalidate(keys.payments, keys.packages, keys.audit),
  });
}

export function useSaveMembership() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (m: Partial<Membership>) => {
      const { id, estimated_end_date: _e, created_at: _c, ...row } = m;
      void _e;
      void _c;
      if (id) return unwrap(sb().from("memberships").update(row).eq("id", id));
      return unwrap(sb().from("memberships").insert(row));
    },
    onSuccess: () => invalidate(keys.memberships, keys.audit),
  });
}

export function useDeleteMembership() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => unwrap(sb().from("memberships").delete().eq("id", id)),
    onSuccess: () => invalidate(keys.memberships, keys.audit),
  });
}

export function useSaveTrainer() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (t: Partial<Trainer>) => {
      const { id, ...row } = t;
      if (id) return unwrap(sb().from("trainers").update(row).eq("id", id));
      return unwrap(sb().from("trainers").insert(row));
    },
    onSuccess: () => invalidate(keys.trainers, keys.packages),
  });
}

export function useUpdateProfile() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (patch: Partial<Profile>) => {
      const { data: u } = await sb().auth.getUser();
      return unwrap(sb().from("profiles").update(patch).eq("id", u.user!.id));
    },
    onSuccess: () => invalidate(keys.profile),
  });
}

export function useSaveBlock() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (b: Partial<ScheduleBlock>) => {
      const { id, ...row } = b;
      if (id) return unwrap(sb().from("schedule_blocks").update(row).eq("id", id));
      return unwrap(sb().from("schedule_blocks").insert(row));
    },
    onSuccess: () => invalidate(keys.blocks),
  });
}

export function useDeleteBlock() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => unwrap(sb().from("schedule_blocks").delete().eq("id", id)),
    onSuccess: () => invalidate(keys.blocks),
  });
}

export interface WorkoutPayload {
  id?: string;
  workout_date: string;
  start_time?: string | null;
  title?: string | null;
  workout_type?: string | null;
  muscle_groups: string[];
  duration_min?: number | null;
  cardio_type?: string | null;
  cardio_min?: number | null;
  distance_km?: number | null;
  energy_level?: number | null;
  with_trainer: boolean;
  trainer_notes?: string | null;
  personal_notes?: string | null;
  discomfort_notes?: string | null;
  exercises: {
    exercise_id?: string | null;
    name: string;
    rest_seconds?: number | null;
    notes?: string | null;
    sets: { reps: number | null; weight_kg: number | null; duration_sec?: number | null; is_warmup?: boolean }[];
  }[];
}

export function useSaveWorkout() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (w: WorkoutPayload) => unwrap<string>(sb().rpc("save_workout", { p: w })),
    onSuccess: () => invalidate(keys.workouts, keys.exercises, keys.audit),
  });
}

export function useDeleteWorkout() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => unwrap(sb().from("workouts").delete().eq("id", id)),
    onSuccess: () => invalidate(keys.workouts, keys.audit),
  });
}

export function useSaveExercise() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (e: Partial<Exercise>) => {
      const { id, ...row } = e;
      if (id) return unwrap(sb().from("exercises").update(row).eq("id", id));
      return unwrap(sb().from("exercises").insert(row));
    },
    onSuccess: () => invalidate(keys.exercises, keys.workouts),
  });
}

export function useSaveTemplate() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (t: Partial<WorkoutTemplate>) => {
      const { id, ...row } = t;
      if (id) return unwrap(sb().from("workout_templates").update(row).eq("id", id));
      return unwrap(sb().from("workout_templates").insert(row));
    },
    onSuccess: () => invalidate(keys.templates),
  });
}

export function useDeleteTemplate() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => unwrap(sb().from("workout_templates").delete().eq("id", id)),
    onSuccess: () => invalidate(keys.templates),
  });
}

export function useSaveMeasurement() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (m: Omit<Measurement, "id"> & { id?: string }) => {
      const { id, ...row } = m;
      if (id) return unwrap(sb().from("body_measurements").update(row).eq("id", id));
      return unwrap(sb().from("body_measurements").upsert(row, { onConflict: "user_id,measured_on,metric" }));
    },
    onSuccess: () => invalidate(keys.measurements),
  });
}

export function useDeleteMeasurement() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => unwrap(sb().from("body_measurements").delete().eq("id", id)),
    onSuccess: () => invalidate(keys.measurements),
  });
}

export function useSaveGoal() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (g: Partial<Goal>) => {
      const { id, ...row } = g;
      if (id) return unwrap(sb().from("goals").update(row).eq("id", id));
      return unwrap(sb().from("goals").insert(row));
    },
    onSuccess: () => invalidate(keys.goals),
  });
}

export function useDeleteGoal() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => unwrap(sb().from("goals").delete().eq("id", id)),
    onSuccess: () => invalidate(keys.goals),
  });
}

export const PHOTO_BUCKET = "progress-photos";

export function useUploadPhoto() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ file, takenOn, note }: { file: File; takenOn: string; note?: string }) => {
      const { data: u } = await sb().auth.getUser();
      const uid = u.user!.id;
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${uid}/${takenOn}-${crypto.randomUUID()}.${ext}`;
      const up = await sb().storage.from(PHOTO_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) throw up.error;
      const { error } = await sb().from("progress_photos").insert({ taken_on: takenOn, storage_path: path, note: note || null });
      if (error) {
        await sb().storage.from(PHOTO_BUCKET).remove([path]);
        throw error;
      }
    },
    onSuccess: () => invalidate(keys.photos),
  });
}

export function useDeletePhoto() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (p: ProgressPhoto) => {
      const { error } = await sb().storage.from(PHOTO_BUCKET).remove([p.storage_path]);
      if (error) throw error;
      return unwrap(sb().from("progress_photos").delete().eq("id", p.id));
    },
    onSuccess: () => invalidate(keys.photos),
  });
}

/** Short-lived signed URLs (10 minutes) for private photos. */
export function useSignedPhotoUrls(photos: ProgressPhoto[] | undefined) {
  const paths = (photos ?? []).map((p) => p.storage_path);
  return useQuery({
    queryKey: ["photo-urls", paths],
    enabled: paths.length > 0,
    staleTime: 8 * 60_000,
    queryFn: async () => {
      const { data, error } = await sb().storage.from(PHOTO_BUCKET).createSignedUrls(paths, 600);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((d) => [d.path, d.signedUrl]));
    },
  });
}

// ---------------------------------------------------------------------------
// Profile photo
// ---------------------------------------------------------------------------
export const AVATAR_BUCKET = "avatars";

/** Signed URL for the uploaded profile photo, falling back to the Google account picture. */
export function useAvatarUrl() {
  const { data: profile } = useProfile();
  const { data: user } = useUser();
  const path = profile?.avatar_path ?? null;
  const signed = useQuery({
    queryKey: ["avatar-url", path],
    enabled: !!path,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await sb().storage.from(AVATAR_BUCKET).createSignedUrl(path!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
  const meta = (user?.user_metadata ?? {}) as { avatar_url?: string; picture?: string };
  return path ? signed.data ?? null : meta.avatar_url ?? meta.picture ?? null;
}

export function useUploadAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File | null) => {
      const { data: u } = await sb().auth.getUser();
      const uid = u.user!.id;
      const { data: prof } = await sb().from("profiles").select("avatar_path").eq("id", uid).single();
      const old = (prof as { avatar_path: string | null } | null)?.avatar_path ?? null;
      let path: string | null = null;
      if (file) {
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
        path = `${uid}/avatar-${Date.now()}.${ext}`;
        const up = await sb().storage.from(AVATAR_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
        if (up.error) throw up.error;
      }
      const { error } = await sb().from("profiles").update({ avatar_path: path }).eq("id", uid);
      if (error) throw error;
      if (old && old !== path) await sb().storage.from(AVATAR_BUCKET).remove([old]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.profile });
      qc.invalidateQueries({ queryKey: ["avatar-url"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Account deletion
// ---------------------------------------------------------------------------
async function removeAllFiles(bucket: string, uid: string, onProgress?: (n: number) => void) {
  let removed = 0;
  // The Storage API is the only way to delete files (and their rows); list in pages until empty.
  for (let guard = 0; guard < 100; guard++) {
    const { data, error } = await sb().storage.from(bucket).list(uid, { limit: 100 });
    if (error) throw error;
    const paths = (data ?? []).filter((f) => f.name && f.id).map((f) => `${uid}/${f.name}`);
    if (!paths.length) break;
    const res = await sb().storage.from(bucket).remove(paths);
    if (res.error) throw res.error;
    removed += paths.length;
    onProgress?.(removed);
  }
  return removed;
}

/**
 * Permanently deletes the signed-in account: photos and avatar files first, then every
 * database record and the login itself (public.delete_my_account). Cannot be undone.
 */
export function useDeleteAccount() {
  return useMutation({
    mutationFn: async ({ confirm, onStep }: { confirm: string; onStep?: (s: string) => void }) => {
      const { data: u } = await sb().auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("Not signed in.");
      onStep?.("Removing your photos…");
      await removeAllFiles(PHOTO_BUCKET, uid);
      await removeAllFiles(AVATAR_BUCKET, uid);
      onStep?.("Deleting your records and account…");
      const { data, error } = await sb().rpc("delete_my_account", { p_confirm: confirm });
      if (error) throw error;
      onStep?.("Signing out…");
      await sb().auth.signOut({ scope: "local" });
      return data as { deleted: boolean; removed: Record<string, number> };
    },
  });
}
