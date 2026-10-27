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

/** The middle of the healthy band: BMI (18.5 + 25) / 2 = 21.75. */
export const BMI_MIDPOINT = (18.5 + 25) / 2;

/** Default target weight: the weight at the midpoint BMI for this height, rounded to 0.5 kg. */
export function midpointTarget(heightCm: number) {
  return Math.round(BMI_MIDPOINT * (heightCm / 100) ** 2 * 2) / 2;
}
