import { describe, expect, it } from "vitest";

import {
  atlasScoreToCosine,
  cosineSimilarity,
  l2Normalize,
} from "@/lib/embeddings/vector";
import {
  decideMatch,
  DEFAULT_THRESHOLDS,
  groupHitsByAlbum,
  pickBestView,
  rankHits,
} from "@/server/services/vinyl/ranking";

describe("groupHitsByAlbum", () => {
  it("keeps the best score per album and counts support", () => {
    const ranked = groupHitsByAlbum([
      { albumId: "a", similarity: 0.8 },
      { albumId: "b", similarity: 0.85 },
      { albumId: "a", similarity: 0.9 },
      { albumId: "a", similarity: 0.7 },
    ]);
    expect(ranked).toEqual([
      { albumId: "a", similarity: 0.9, support: 3 },
      { albumId: "b", similarity: 0.85, support: 1 },
    ]);
  });

  it("remembers which cover image the scan looks most like", () => {
    const [top] = groupHitsByAlbum([
      {
        albumId: "a",
        similarity: 0.84,
        source: "catalog",
        imageUrl: "https://caa/front",
      },
      {
        albumId: "a",
        similarity: 0.86,
        source: "variant",
        imageUrl: "https://discogs/2024",
      },
      // Augmented vectors win the score but have no image of their own.
      { albumId: "a", similarity: 0.88, source: "augment" },
    ]);
    expect(top).toMatchObject({
      similarity: 0.88,
      source: "augment",
      image: { url: "https://discogs/2024", source: "variant" },
    });
  });

  it("keeps the catalog cover when it beats every pressing", () => {
    const [top] = groupHitsByAlbum([
      {
        albumId: "a",
        similarity: 0.8,
        source: "variant",
        imageUrl: "https://discogs/2024",
      },
      {
        albumId: "a",
        similarity: 0.9,
        source: "catalog",
        imageUrl: "https://caa/front",
      },
    ]);
    expect(top.image).toMatchObject({
      url: "https://caa/front",
      source: "catalog",
    });
  });
});

describe("decideMatch", () => {
  it("matches when the top hit is high and clearly ahead", () => {
    expect(
      decideMatch([
        { albumId: "a", similarity: 0.93, support: 2 },
        { albumId: "b", similarity: 0.8, support: 1 },
      ])
    ).toBe("matched");
  });

  it("is ambiguous when two albums are neck and neck", () => {
    expect(
      decideMatch([
        { albumId: "a", similarity: 0.91, support: 1 },
        { albumId: "b", similarity: 0.9, support: 1 },
      ])
    ).toBe("ambiguous");
  });

  it("is ambiguous when plausible but below the match bar", () => {
    expect(decideMatch([{ albumId: "a", similarity: 0.78, support: 1 }])).toBe(
      "ambiguous"
    );
  });

  it("returns none for weak or empty results", () => {
    expect(decideMatch([])).toBe("none");
    expect(decideMatch([{ albumId: "a", similarity: 0.5, support: 1 }])).toBe(
      "none"
    );
  });

  it("matches a single strong hit with no runner-up", () => {
    expect(
      decideMatch([
        { albumId: "a", similarity: DEFAULT_THRESHOLDS.match, support: 1 },
      ])
    ).toBe("matched");
  });
});

describe("rankHits", () => {
  it("drops candidates below the candidate threshold and respects limit", () => {
    const hits = [0.95, 0.9, 0.85, 0.8, 0.75, 0.74, 0.6].map((s, i) => ({
      albumId: `x${i}`,
      similarity: s,
    }));
    const { status, candidates } = rankHits(hits, 4);
    expect(status).toBe("matched");
    expect(candidates.map((c) => c.albumId)).toEqual(["x0", "x1", "x2", "x3"]);
  });
});

describe("vector helpers", () => {
  it("normalises to unit length", () => {
    const v = l2Normalize([3, 4]);
    expect(v[0]).toBeCloseTo(0.6);
    expect(v[1]).toBeCloseTo(0.8);
  });

  it("converts Atlas cosine scores back to cosine", () => {
    expect(atlasScoreToCosine(1)).toBe(1);
    expect(atlasScoreToCosine(0.5)).toBe(0);
    expect(atlasScoreToCosine(0.95)).toBeCloseTo(0.9);
  });

  it("computes cosine similarity", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([1, 1], [2, 2])).toBeCloseTo(1);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe("pickBestView", () => {
  const view = (status: "matched" | "ambiguous" | "none", top?: number) => ({
    status,
    candidates:
      top === undefined ? [] : [{ albumId: "a", similarity: top, support: 1 }],
  });

  it("prefers a confident match over a higher-scoring ambiguous view", () => {
    expect(pickBestView([view("ambiguous", 0.85), view("matched", 0.84)])).toBe(
      1
    );
  });

  it("breaks ties within a status by top similarity", () => {
    expect(
      pickBestView([view("ambiguous", 0.75), view("ambiguous", 0.8)])
    ).toBe(1);
  });

  it("keeps the first view when nothing matched anywhere", () => {
    expect(pickBestView([view("none"), view("none")])).toBe(0);
  });
});
