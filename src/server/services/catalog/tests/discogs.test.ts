import { describe, expect, it } from "vitest";

import { l2Normalize } from "@/lib/embeddings/vector";
import {
  bestSearchMatch,
  cleanArtistName,
  searchText,
} from "@/server/services/catalog/discogs";
import { pickDiverse } from "@/server/services/catalog/variants";

const v = (...xs: number[]) =>
  l2Normalize([...xs, ...new Array(8 - xs.length).fill(0)]);

describe("pickDiverse", () => {
  it("keeps the original, then the most different cover before near-copies", () => {
    const original = { id: "2004", vector: v(1, 0) };
    const photoOfOriginal = { id: "2007", vector: v(1, 0.3) }; // same art, ~0.96
    const sticker = { id: "2018", vector: v(1, 0.6) }; // same art w/ hype sticker, ~0.86
    const reissueArt = { id: "2024", vector: v(0.2, 0, 1) }; // different artwork
    const picked = pickDiverse(
      [original, photoOfOriginal, sticker, reissueArt],
      3
    );
    expect(picked.map((p) => p.id)).toEqual(["2004", "2024", "2018"]);
  });

  it("never adds near-duplicates, even with room to spare", () => {
    const a = { id: "a", vector: v(1, 0) };
    const b = { id: "b", vector: v(1, 0.05) };
    expect(pickDiverse([a, b], 6).map((p) => p.id)).toEqual(["a"]);
  });

  it("handles no pressings", () => {
    expect(pickDiverse([], 6)).toEqual([]);
  });
});

describe("Discogs names", () => {
  it("strips Discogs' numbering and asterisks from artist names", () => {
    expect(cleanArtistName("MF Doom (2)")).toBe("MF Doom");
    expect(cleanArtistName("M.F. Doom*")).toBe("M.F. Doom");
  });

  it("matches 'Artist - Title' results to the album asked for", () => {
    const results = [
      {
        id: 63225,
        type: "master" as const,
        title: "M.F. Doom* - MM..More Food",
      },
      { id: 8478, type: "master" as const, title: "MF Doom - MM..Food" },
    ];
    expect(bestSearchMatch(results, "MF DOOM", "MM..FOOD")?.id).toBe(8478);
    expect(bestSearchMatch(results, "Madvillain", "MM..FOOD")).toBeNull();
  });
});

describe("searchText", () => {
  it("straightens typographic punctuation Discogs search won't match", () => {
    expect(searchText("D’Angelo")).toBe("D'Angelo");
    expect(searchText("“Awaken, My Love!”")).toBe('"Awaken, My Love!"');
    expect(searchText("Tu‐P‐A‐C")).toBe("Tu-P-A-C");
  });
});
