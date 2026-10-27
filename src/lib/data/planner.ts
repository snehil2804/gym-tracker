"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase/client";
import type { CatalogExercise, DefaultOverrides, PlanDay, TemplateDayRow, TemplateItemRow } from "@/lib/domain/planner";

/*
  Data access for the workout planner (tables from migration 20261028000010).
  Shared tables (plan_exercises, plan_template_*) are read-only for everyone; the rest are
  owner-only through RLS, so every query below only ever sees the signed-in user's rows.
*/

const sb = () => getSupabase();

async function unwrap<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data as T;
}

export const plannerKeys = {
  catalog: ["planner", "catalog"] as const,
  template: ["planner", "template"] as const,
  settings: ["planner", "settings"] as const,
  plans: ["planner", "plans"] as const,
  activity: (date: string) => ["planner", "activity", date] as const,
  activityRange: (from: string, to: string) => ["planner", "activity", from, to] as const,
};

export interface PlannerSettings {
  active_plan_id: string | null;
  default_overrides: DefaultOverrides;
  step_target: number;
  cardio_days: number[];
}
export const DEFAULT_SETTINGS: PlannerSettings = { active_plan_id: null, default_overrides: {}, step_target: 9000, cardio_days: [1, 4, 6] };

export interface WorkoutPlan {
  id: string;
  name: string;
  days: PlanDay[];
  created_at: string;
  updated_at: string;
}

export interface CardioLog {
  done?: boolean;
  activity?: string;
  minutes?: number | null;
  avg_hr?: number | null;
}
export interface DailyActivity {
  log_date: string;
  steps: number | null;
  cardio: CardioLog;
  warmup: { done?: string[] };
  mobility: { done?: string[] };
  neat: { done?: string[] };
}
export const emptyActivity = (date: string): DailyActivity => ({ log_date: date, steps: null, cardio: {}, warmup: {}, mobility: {}, neat: {} });

// ---------------------------------------------------------------------------
// Shared, read-only
// ---------------------------------------------------------------------------
export function usePlanCatalog() {
  return useQuery({
    queryKey: plannerKeys.catalog,
    queryFn: () => unwrap<CatalogExercise[]>(sb().from("plan_exercises").select("id, name, primary_muscle, target_muscles, equipment, instructions, video_id, video_url, video_title, video_creator, video_status").order("name")),
    staleTime: 60 * 60_000,
  });
}

export function useDefaultTemplate() {
  return useQuery({
    queryKey: plannerKeys.template,
    queryFn: async () => {
      const tpl = await unwrap<{ id: string; name: string; description: string | null }>(sb().from("plan_templates").select("id, name, description").eq("is_default", true).single());
      const [days, items] = await Promise.all([
        unwrap<TemplateDayRow[]>(sb().from("plan_template_days").select("weekday, title, focus, is_rest").eq("template_id", tpl.id)),
        unwrap<TemplateItemRow[]>(
          sb().from("plan_template_items").select("weekday, position, exercise_id, sets, reps_min, reps_max, reps_unit, rir, rest_min_s, rest_max_s, notes").eq("template_id", tpl.id),
        ),
      ]);
      return { ...tpl, days, items };
    },
    staleTime: 60 * 60_000,
  });
}

// ---------------------------------------------------------------------------
// Private
// ---------------------------------------------------------------------------
export function usePlannerSettings() {
  return useQuery({
    queryKey: plannerKeys.settings,
    queryFn: async () => {
      const row = await unwrap<PlannerSettings | null>(sb().from("planner_settings").select("active_plan_id, default_overrides, step_target, cardio_days").maybeSingle());
      return row ?? DEFAULT_SETTINGS;
    },
  });
}

export function useSavePlannerSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ["planner", "save-settings"],
    scope: { id: "planner-settings" },
    mutationFn: async (patch: Partial<PlannerSettings>) => {
      const current = qc.getQueryData<PlannerSettings>(plannerKeys.settings) ?? DEFAULT_SETTINGS;
      const next = { ...current, ...patch };
      await unwrap(sb().from("planner_settings").upsert(next, { onConflict: "user_id" }));
      return next;
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: plannerKeys.settings });
      const prev = qc.getQueryData<PlannerSettings>(plannerKeys.settings);
      qc.setQueryData(plannerKeys.settings, { ...(prev ?? DEFAULT_SETTINGS), ...patch });
      return { prev };
    },
    onError: (_e, _p, ctx) => ctx?.prev && qc.setQueryData(plannerKeys.settings, ctx.prev),
    onSettled: () => {
      if (qc.isMutating({ mutationKey: ["planner", "save-settings"] }) <= 1) qc.invalidateQueries({ queryKey: plannerKeys.settings });
    },
  });
}

export function useWorkoutPlans() {
  return useQuery({
    queryKey: plannerKeys.plans,
    queryFn: () => unwrap<WorkoutPlan[]>(sb().from("workout_plans").select("id, name, days, created_at, updated_at").order("name")),
  });
}

export function useSavePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id?: string; name: string; days: PlanDay[] }) => {
      const row = { name: p.name.trim(), days: p.days };
      if (p.id) return unwrap<WorkoutPlan>(sb().from("workout_plans").update(row).eq("id", p.id).select().single());
      return unwrap<WorkoutPlan>(sb().from("workout_plans").insert(row).select().single());
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: plannerKeys.plans }),
  });
}

export function useDeletePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(sb().from("workout_plans").delete().eq("id", id)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: plannerKeys.plans });
      qc.invalidateQueries({ queryKey: plannerKeys.settings });
    },
  });
}

export function useDailyActivity(date: string) {
  return useQuery({
    queryKey: plannerKeys.activity(date),
    queryFn: async () => {
      const row = await unwrap<DailyActivity | null>(
        sb().from("daily_activity").select("log_date, steps, cardio, warmup, mobility, neat").eq("log_date", date).maybeSingle(),
      );
      return row ?? emptyActivity(date);
    },
  });
}

/** Steps and cardio for a date range (for the weekly cardio count). */
export function useActivityRange(from: string, to: string) {
  return useQuery({
    queryKey: plannerKeys.activityRange(from, to),
    queryFn: () => unwrap<DailyActivity[]>(sb().from("daily_activity").select("log_date, steps, cardio, warmup, mobility, neat").gte("log_date", from).lte("log_date", to)),
  });
}

type ActivityPatch = Partial<Omit<DailyActivity, "log_date">>;

/**
 * Saves one day's activity. Each change is applied to the screen immediately (synchronously, so
 * several quick taps all count), then saves run one after another and each sends the full,
 * current state of the day. On an error the day is reloaded from the server.
 * `mutate` takes a patch, or a function of the current state that returns one.
 */
export function useSaveDailyActivity(date: string) {
  const qc = useQueryClient();
  const key = plannerKeys.activity(date);
  const mutationKey = ["planner", "save-activity", date];
  const m = useMutation({
    mutationKey,
    scope: { id: `activity-${date}` },
    mutationFn: async () => {
      const next = { ...(qc.getQueryData<DailyActivity>(key) ?? emptyActivity(date)), log_date: date };
      await unwrap(sb().from("daily_activity").upsert(next, { onConflict: "user_id,log_date" }));
      return next;
    },
    onError: () => qc.invalidateQueries({ queryKey: key }),
    onSettled: () => {
      if (qc.isMutating({ mutationKey }) <= 1) qc.invalidateQueries({ queryKey: ["planner", "activity"] });
    },
  });
  const mutate = (patch: ActivityPatch | ((cur: DailyActivity) => ActivityPatch), opts?: { onError?: (e: unknown) => void }) => {
    void qc.cancelQueries({ queryKey: key });
    const cur = qc.getQueryData<DailyActivity>(key) ?? emptyActivity(date);
    qc.setQueryData(key, { ...cur, ...(typeof patch === "function" ? patch(cur) : patch) });
    m.mutate(undefined, opts);
  };
  return { mutate, isPending: m.isPending };
}
