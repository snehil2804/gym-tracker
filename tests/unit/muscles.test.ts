import { describe, expect, it } from "vitest";
import { groupOf, parseShortsUrl } from "@/lib/domain/muscles";

describe("muscle groups", () => {
  it("files leg muscles under Legs and unknowns under Other", () => {
    expect(groupOf("quads")).toBe("legs");
    expect(groupOf("calves")).toBe("legs");
    expect(groupOf("Chest")).toBe("chest");
    expect(groupOf("core")).toBe("core");
    expect(groupOf("neck")).toBe("other");
    expect(groupOf(null)).toBe("other");
  });
});

describe("YouTube Shorts links", () => {
  it("accepts Shorts URLs in their common forms", () => {
    expect(parseShortsUrl("https://www.youtube.com/shorts/oS2Uy3MAbgs")).toBe("oS2Uy3MAbgs");
    expect(parseShortsUrl("youtube.com/shorts/oS2Uy3MAbgs?feature=share")).toBe("oS2Uy3MAbgs");
    expect(parseShortsUrl("https://m.youtube.com/shorts/-wrUruAXpbA")).toBe("-wrUruAXpbA");
  });
  it("rejects regular videos and other sites", () => {
    expect(parseShortsUrl("https://www.youtube.com/watch?v=oS2Uy3MAbgs")).toBeNull();
    expect(parseShortsUrl("https://youtu.be/oS2Uy3MAbgs")).toBeNull();
    expect(parseShortsUrl("https://evil.com/youtube.com/shorts/oS2Uy3MAbgs")).toBeNull();
    expect(parseShortsUrl("https://www.youtube.com/shorts/short")).toBeNull();
  });
});
