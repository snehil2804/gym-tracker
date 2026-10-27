/**
 * Muscle-group categories for the exercise library, plus YouTube Shorts URL handling.
 * Exercises store a fine-grained `primary_muscle` (quads, hamstrings, …); the library groups them.
 */

export const MUSCLE_GROUPS = [
  { id: "chest", label: "Chest", muscles: ["chest"] },
  { id: "back", label: "Back", muscles: ["back"] },
  { id: "shoulders", label: "Shoulders", muscles: ["shoulders"] },
  { id: "biceps", label: "Biceps", muscles: ["biceps"] },
  { id: "triceps", label: "Triceps", muscles: ["triceps"] },
  { id: "forearms", label: "Forearms", muscles: ["forearms"] },
  { id: "legs", label: "Legs", muscles: ["quads", "hamstrings", "glutes", "calves"] },
  { id: "core", label: "Abs & Core", muscles: ["core"] },
  { id: "cardio", label: "Cardio", muscles: ["cardio"] },
  { id: "other", label: "Other", muscles: ["other"] },
] as const;

export type MuscleGroupId = (typeof MUSCLE_GROUPS)[number]["id"];

/** Targets you can pick for an exercise (legs are split so progress can tell them apart). */
export const TARGET_MUSCLES = [
  { value: "chest", label: "Chest" },
  { value: "back", label: "Back" },
  { value: "shoulders", label: "Shoulders" },
  { value: "biceps", label: "Biceps" },
  { value: "triceps", label: "Triceps" },
  { value: "forearms", label: "Forearms" },
  { value: "quads", label: "Legs — quads" },
  { value: "hamstrings", label: "Legs — hamstrings" },
  { value: "glutes", label: "Legs — glutes" },
  { value: "calves", label: "Legs — calves" },
  { value: "core", label: "Abs & core" },
  { value: "cardio", label: "Cardio" },
  { value: "other", label: "Other" },
];

export function groupOf(primaryMuscle: string | null | undefined): MuscleGroupId {
  const m = (primaryMuscle ?? "other").toLowerCase();
  return MUSCLE_GROUPS.find((g) => (g.muscles as readonly string[]).includes(m))?.id ?? "other";
}

export function groupLabel(id: MuscleGroupId) {
  return MUSCLE_GROUPS.find((g) => g.id === id)?.label ?? "Other";
}

/**
 * Accepts only YouTube *Shorts* links and returns the 11-character video id, e.g.
 * https://www.youtube.com/shorts/abc123DEF45, youtube.com/shorts/…?feature=share, m.youtube.com/shorts/….
 * Regular watch?v= links and youtu.be links are rejected.
 */
export function parseShortsUrl(input: string): string | null {
  const s = input.trim();
  const m = s.match(/^(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/shorts\/([A-Za-z0-9_-]{11})(?:[/?#&].*)?$/i);
  return m ? m[1] : null;
}

export const shortsUrl = (id: string) => `https://www.youtube.com/shorts/${id}`;
