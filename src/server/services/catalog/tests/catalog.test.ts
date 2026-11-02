import { describe, expect, it } from "vitest";

import {
  artistMatches,
  artistsOverlap,
  normalizeName,
  pickArtist,
  titlesMatchLoose,
  toCatalogAlbum,
} from "@/server/services/catalog/musicbrainz";
import { scoreSpotifyCandidate } from "@/server/services/catalog/spotify";

describe("toCatalogAlbum", () => {
  it("flattens a MusicBrainz release group", () => {
    const album = toCatalogAlbum({
      id: "rg-1",
      title: "Voodoo",
      "primary-type": "Album",
      "first-release-date": "2000-01-25",
      "artist-credit": [
        { name: "D’Angelo", artist: { id: "art-1", name: "D’Angelo" } },
      ],
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
      artistName: "D’Angelo",
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
        {
          name: "JAY-Z",
          joinphrase: " & ",
          artist: { id: "a", name: "JAY-Z" },
        },
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

describe("artistMatches", () => {
  it("ignores a leading 'The' and accents", () => {
    expect(artistMatches("The Lijadu Sisters", "Lijadu Sisters")).toBe(true);
    expect(artistMatches("Beyonce", "Beyoncé")).toBe(true);
  });

  it("matches collaborations credited in a different order", () => {
    expect(
      artistMatches(
        "Manu Dibango & Cuarteto Patria",
        "Cuarteto Patria & Manu Dibango"
      )
    ).toBe(true);
    expect(artistMatches("Madlib x MF DOOM", "Madvillain")).toBe(false);
  });

  it("rejects a different artist with the same title", () => {
    expect(artistMatches("Elujay", "Strangled")).toBe(false);
  });
});

describe("artistsOverlap & titlesMatchLoose", () => {
  it("matches a Discogs lead-only credit on a collaboration", () => {
    expect(
      artistsOverlap("Nicholas Craven & Boldy James", "Boldy James")
    ).toBe(true);
    expect(artistsOverlap("Various Artists", "Various")).toBe(true);
  });

  it("matches Discogs subtitles and strips zero-width spaces", () => {
    expect(
      titlesMatchLoose(
        "Nigeria 70: Lagos Jump",
        "Nigeria 70 (Lagos Jump: Original Heavyweight Afrobeat, Highlife & Afro-Funk)"
      )
    ).toBe(true);
    expect(
      normalizeName(`2MM Don\u200B’\u200Bt Just Stand There!`)
    ).toBe("2mm dont just stand there");
  });
});

describe("pickArtist", () => {
  it("takes the exact name, not a lookalike ranked above it", () => {
    const results = [
      { name: "Sza/Za", mbid: "polish" },
      { name: "SZA", mbid: "sza" },
    ];
    expect(pickArtist("SZA", results)?.mbid).toBe("sza");
    expect(
      pickArtist("the beatles", [{ name: "The Beatles", mbid: "b" }])?.mbid
    ).toBe("b");
  });

  it("falls back to MusicBrainz's top hit, or null", () => {
    expect(pickArtist("Sade Adu", [{ name: "Sade", mbid: "s" }])?.mbid).toBe(
      "s"
    );
    expect(pickArtist("nobody", [])).toBeNull();
  });
});
