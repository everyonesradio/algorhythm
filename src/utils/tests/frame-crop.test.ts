import { describe, expect, it } from "vitest";

import {
  centerSquareCrop,
  computeGuideCrop,
  MAX_SAME_SCENE_SKIPS,
  skipSameScene,
} from "@/utils/frame-crop";

describe("computeGuideCrop", () => {
  it("maps the guide on a portrait phone screen into landscape video pixels", () => {
    // 1280x720 video shown object-fit: cover on a 390x844 screen.
    // scale = max(390/1280, 844/720) = 1.1722; guide = 0.72 * 390 = 280.8px
    const crop = computeGuideCrop(1280, 720, 390, 844, 0.72);
    expect(crop.size).toBeCloseTo(280.8 / (844 / 720), 3);
    expect(crop.sx + crop.size / 2).toBeCloseTo(640);
    expect(crop.sy + crop.size / 2).toBeCloseTo(360);
  });

  it("never exceeds the video frame", () => {
    const crop = computeGuideCrop(640, 480, 2000, 300, 1);
    expect(crop.size).toBeLessThanOrEqual(480);
    expect(crop.sx).toBeGreaterThanOrEqual(0);
    expect(crop.sy).toBeGreaterThanOrEqual(0);
  });

  it("handles a video that isn't ready yet", () => {
    expect(computeGuideCrop(0, 0, 390, 844, 0.72).size).toBe(0);
  });
});

describe("centerSquareCrop", () => {
  it("crops the centre of an image", () => {
    expect(centerSquareCrop(4000, 3000, 0.9)).toEqual({
      sx: 650,
      sy: 150,
      size: 2700,
    });
  });
});

describe("sortBySimilarity", () => {
  it("puts the closest covers first and unscored ones last, in order", async () => {
    const { sortBySimilarity } = await import("@/utils/rank-covers");
    const out = sortBySimilarity([
      { id: "a", similarity: null },
      { id: "b", similarity: 0.6 },
      { id: "c", similarity: 0.9 },
      { id: "d", similarity: null },
    ]);
    expect(out.map((x) => x.id)).toEqual(["c", "b", "a", "d"]);
  });
});

describe("skipSameScene", () => {
  const base = { lastStatus: "none", diff: 1.5, skips: 0, mustAsk: false };

  it("skips a still scene that just had no match", () => {
    expect(skipSameScene(base)).toBe(true);
  });

  it("asks when anything changed, or the last answer wasn't 'none'", () => {
    expect(skipSameScene({ ...base, diff: 25 })).toBe(false);
    expect(skipSameScene({ ...base, lastStatus: "ambiguous" })).toBe(false);
    expect(skipSameScene({ ...base, lastStatus: null })).toBe(false);
  });

  it("asks when the artist picker is due, and every so often regardless", () => {
    expect(skipSameScene({ ...base, mustAsk: true })).toBe(false);
    expect(skipSameScene({ ...base, skips: MAX_SAME_SCENE_SKIPS })).toBe(false);
  });
});
