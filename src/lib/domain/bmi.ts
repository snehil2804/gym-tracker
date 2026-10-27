/** Body-mass index (WHO adult categories) and the healthy weight range for a height. */

export type BmiClass = "underweight" | "normal" | "overweight" | "obesity";

export const BMI_HEALTHY = { min: 18.5, max: 24.9 };

export function bmi(weightKg: number, heightCm: number): number | null {
  if (!(weightKg > 0) || !(heightCm > 0)) return null;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

export function classify(value: number): BmiClass {
  if (value < 18.5) return "underweight";
  if (value < 25) return "normal";
  if (value < 30) return "overweight";
  return "obesity";
}

export const BMI_LABEL: Record<BmiClass, string> = {
  underweight: "Underweight",
  normal: "Normal weight",
  overweight: "Overweight",
  obesity: "Obesity",
};

/** Weight range (kg, 1 decimal) that keeps BMI between 18.5 and 24.9 at this height. */
export function healthyRange(heightCm: number) {
  const m2 = (heightCm / 100) ** 2;
  return { min: Math.ceil(BMI_HEALTHY.min * m2 * 10) / 10, max: Math.floor(BMI_HEALTHY.max * m2 * 10) / 10 };
}

/** A sensible default target: the current weight if healthy, otherwise the nearest healthy edge. */
export function suggestedTarget(weightKg: number, heightCm: number) {
  const r = healthyRange(heightCm);
  return Math.min(Math.max(Math.round(weightKg * 2) / 2, Math.ceil(r.min * 2) / 2), Math.floor(r.max * 2) / 2);
}
