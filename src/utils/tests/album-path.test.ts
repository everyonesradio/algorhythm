import { describe, expect, it } from "vitest";

import { albumIdFromSlug, albumPath } from "@/utils/album-path";

const ID = "6ae78bfcb1f8cf2dabe65e04";

describe("album pages", () => {
  it("builds a readable, ASCII path that ends with the album id", () => {
    expect(albumPath({ id: ID, artist: "SZA", title: "SOS" })).toBe(
      `/library/sza-sos-${ID}`
    );
    expect(
      albumPath({ id: ID, artist: "D’Angelo", title: "Brown Sugar" })
    ).toBe(`/library/d-angelo-brown-sugar-${ID}`);
    expect(
      albumPath({
        id: ID,
        artist: "Beyoncé & JAY-Z",
        title: "Everything Is Love",
      })
    ).toBe(`/library/beyonce-and-jay-z-everything-is-love-${ID}`);
  });

  it("copes with titles that have no letters or are very long", () => {
    expect(albumPath({ id: ID, artist: "シン", title: "…" })).toBe(
      `/library/${ID}`
    );
    const long = albumPath({ id: ID, artist: "A".repeat(80), title: "B" });
    expect(long.length).toBeLessThan(110);
    expect(long.endsWith(`-${ID}`)).toBe(true);
  });

  it("reads the id back from any slug, and nothing else", () => {
    expect(albumIdFromSlug(`sza-sos-${ID}`)).toBe(ID);
    expect(albumIdFromSlug(`wrong-name-${ID.toUpperCase()}`)).toBe(ID);
    expect(albumIdFromSlug(ID)).toBe(ID);
    expect(albumIdFromSlug("sza-sos")).toBeNull();
    expect(albumIdFromSlug(`x${ID}`)).toBeNull();
  });
});
