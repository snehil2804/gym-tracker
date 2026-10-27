import { describe, expect, it } from "vitest";
import { fitWithin, rotatedSize } from "@/lib/photo/crop";

describe("photo crop maths", () => {
  it("swaps width and height for quarter turns", () => {
    const s = rotatedSize(4000, 3000, 90);
    expect(Math.round(s.width)).toBe(3000);
    expect(Math.round(s.height)).toBe(4000);
    const n = rotatedSize(4000, 3000, 180);
    expect(Math.round(n.width)).toBe(4000);
  });
  it("grows the bounding box for a tilt", () => {
    const s = rotatedSize(100, 100, 45);
    expect(s.width).toBeCloseTo(141.42, 1);
  });
  it("scales large crops down to the limit and never up", () => {
    expect(fitWithin({ width: 6000, height: 4000 }, 3000)).toMatchObject({ width: 3000, height: 2000 });
    expect(fitWithin({ width: 800, height: 600 }, 1024)).toMatchObject({ width: 800, height: 600, scale: 1 });
  });
});
