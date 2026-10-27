import { describe, expect, it } from "vitest";
import { bmi, classify, healthyRange, midpointTarget } from "@/lib/domain/bmi";

describe("BMI", () => {
  it("computes BMI to one decimal", () => {
    expect(bmi(79.3, 172)).toBe(26.8);
    expect(bmi(70, 0)).toBeNull();
  });
  it("classifies by WHO adult bands", () => {
    expect(classify(18.4)).toBe("underweight");
    expect(classify(18.5)).toBe("normal");
    expect(classify(24.9)).toBe("normal");
    expect(classify(25)).toBe("overweight");
    expect(classify(29.9)).toBe("overweight");
    expect(classify(30)).toBe("obesity");
  });
  it("gives the healthy weight range for a height and a target inside it", () => {
    expect(healthyRange(172)).toEqual({ min: 54.8, max: 73.6 });
    // midpoint BMI 21.75 × 1.72² = 64.3 kg → 64.5
    expect(midpointTarget(172)).toBe(64.5);
    expect(bmi(midpointTarget(172), 172)).toBe(21.8);
    expect(midpointTarget(180)).toBe(70.5);
  });
});
