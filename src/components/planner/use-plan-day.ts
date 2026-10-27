"use client";

import { useMemo } from "react";
import { useDefaultTemplate, usePlanCatalog, usePlannerSettings, useWorkoutPlans } from "@/lib/data/planner";
import { isoWeekday } from "@/lib/domain/dates";
import { buildDefaultDays, type CatalogExercise, type PlanDay } from "@/lib/domain/planner";

/**
 * The plan day for a date, from whichever plan is active: the selected custom plan, or the shared
 * default (with this user's custom sets/reps applied).
 */
export function usePlanDay(date: string) {
  const catalog = usePlanCatalog();
  const template = useDefaultTemplate();
  const settings = usePlannerSettings();
  const plans = useWorkoutPlans();
  const loading = catalog.isLoading || template.isLoading || settings.isLoading || plans.isLoading;
  const error = catalog.error || template.error || settings.error || plans.error;

  const value = useMemo(() => {
    if (!catalog.data || !template.data || !settings.data || !plans.data) return null;
    const active = plans.data.find((p) => p.id === settings.data.active_plan_id) ?? null;
    const days: PlanDay[] = active ? active.days : buildDefaultDays(template.data.days, template.data.items, settings.data.default_overrides);
    const day = days.find((d) => d.weekday === isoWeekday(date)) ?? null;
    const catalogMap = new Map<string, CatalogExercise>(catalog.data.map((c) => [c.id, c]));
    return { day, planName: active?.name ?? template.data.name, isCustom: !!active, catalogMap };
  }, [catalog.data, template.data, settings.data, plans.data, date]);

  return { data: value, loading, error };
}
