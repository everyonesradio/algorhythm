import { describe, expect, it } from "vitest";

import { toCatalogAlbum } from "../musicbrainz";
import { scoreSpotifyCandidate } from "../spotify";

describe("toCatalogAlbum", () => {
  it("flattens a MusicBrainz release group", () => {
    const album = toCatalogAlbum({
      id: "rg-1",
      title: "Voodoo",
      "primary-type": "Album",
      "first-release-date": "2000-01-25",
      "artist-credit": [{ name: "D’Angelo", artist: { id: "art-1", name: "D’Angelo" } }],
      genres: [
        { name: "neo soul", count: 5 },
        { name: "r&b", count: 3 },
        { name: "unused", count: 0 },
      ],
      tags: [{ name: "soul", count: 2 }],
    });
    expect(album).toEqual({
      mbid: "rg-1",
      title: "Voodoo",
      artist: "D’Angelo",
      artistMbid: "art-1",
      releaseYear: 2000,
      primaryType: "Album",
      genres: ["neo soul", "r&b"],
      tags: ["soul"],
    });
  });

  it("joins multi-artist credits and tolerates missing dates", () => {
    const album = toCatalogAlbum({
      id: "rg-2",
      title: "Watch the Throne",
      "artist-credit": [
        { name: "JAY-Z", joinphrase: " & ", artist: { id: "a", name: "JAY-Z" } },
        { name: "Kanye West", artist: { id: "b", name: "Kanye West" } },
      ],
    });
    expect(album.artist).toBe("JAY-Z & Kanye West");
    expect(album.releaseYear).toBeNull();
  });
});

describe("scoreSpotifyCandidate", () => {
  it("ignores edition suffixes and accents", () => {
    const score = scoreSpotifyCandidate(
      { artist: "Beyoncé", title: "Lemonade" },
      { artist: "Beyonce", title: "Lemonade (Deluxe Edition)" }
    );
    expect(score).toBeGreaterThan(0.95);
  });

  it("scores unrelated albums low", () => {
    const score = scoreSpotifyCandidate(
      { artist: "Amaarae", title: "The Angel You Don't Know" },
      { artist: "Kendrick Lamar", title: "DAMN." }
    );
    expect(score).toBeLessThan(0.4);
  });
});
