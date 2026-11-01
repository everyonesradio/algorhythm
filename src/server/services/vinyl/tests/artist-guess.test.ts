import { describe, expect, it } from "vitest";

import { suggestArtists } from "@/server/services/vinyl/artist-guess";

const hit = (similarity: number, artist: string, artistMbid: string | null = artist) => ({
  similarity,
  artist,
  artistMbid,
});

describe("suggestArtists", () => {
  it("offers distinct artists, best first (measured DAMN. scan)", () => {
    // Real nearest albums for the DAMN. cover: Kendrick is 2nd, not 1st.
    const s = suggestArtists([
      hit(0.708, "Frank Ocean"),
      hit(0.699, "Kendrick Lamar"),
      hit(0.673, "Childish Gambino"),
      hit(0.671, "Tyler, the Creator"),
      hit(0.654, "Kendrick Lamar"),
    ]);
    expect(s.map((a) => a.name)).toEqual(["Frank Ocean", "Kendrick Lamar", "Childish Gambino"]);
  });

  it("does not repeat an artist with several near albums", () => {
    const s = suggestArtists([hit(0.7, "Kendrick Lamar"), hit(0.69, "Kendrick Lamar"), hit(0.65, "SZA")]);
    expect(s.map((a) => a.name)).toEqual(["Kendrick Lamar", "SZA"]);
  });

  it("ignores hits below the floor and albums without an artist id", () => {
    expect(suggestArtists([hit(0.55, "Kendrick Lamar")])).toEqual([]);
    expect(suggestArtists([hit(0.9, "Unknown", null)])).toEqual([]);
  });
});
