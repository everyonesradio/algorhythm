import { describe, expect, it, vi } from "vitest";

import { Adapter } from "@/config/enum";
import {
  parseMusicLink,
  type ResolveDeps,
  resolveMusicLink,
  UnsupportedLinkError,
} from "@/server/services/links/resolve-link";

describe("parseMusicLink", () => {
  it("recognises album and track links and canonicalises them", () => {
    expect(
      parseMusicLink(
        "https://open.spotify.com/intl-de/album/3M1PhSsHmAlh79bAz9jBZs?si=abc"
      )
    ).toEqual({
      platform: Adapter.Spotify,
      kind: "album",
      id: "3M1PhSsHmAlh79bAz9jBZs",
      url: "https://open.spotify.com/album/3M1PhSsHmAlh79bAz9jBZs",
    });
    expect(
      parseMusicLink(
        "https://music.apple.com/gb/album/showbiz/1788674268?i=1788674270"
      )
    ).toMatchObject({
      platform: Adapter.AppleMusic,
      kind: "album",
      id: "1788674268",
    });
    expect(parseMusicLink("https://www.deezer.com/fr/track/123")).toMatchObject(
      { platform: Adapter.Deezer, kind: "track" }
    );
    expect(
      parseMusicLink("https://listen.tidal.com/album/409315982")?.url
    ).toBe("https://tidal.com/album/409315982");
    expect(
      parseMusicLink("https://music.youtube.com/playlist?list=OLAK5uy_abc")
        ?.kind
    ).toBe("album");
    expect(parseMusicLink("https://soundcloud.com/mike/sets/showbiz")?.id).toBe(
      "mike/showbiz"
    );
  });

  it("rejects what isn't an album or track", () => {
    expect(
      parseMusicLink("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M")
    ).toBeNull();
    expect(
      parseMusicLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    ).toBeNull();
    expect(parseMusicLink("not a url")).toBeNull();
  });
});

const SPOTIFY = "https://open.spotify.com/album/3M1PhSsHmAlh79bAz9jBZs";
const showbiz = {
  title: "Showbiz!",
  artist: "MIKE",
  upc: "5056818801693",
  url: SPOTIFY,
  imageUrl: "img",
};

const deps = (over: Partial<ResolveDeps> = {}): ResolveDeps => ({
  platformAlbum: { [Adapter.Spotify]: vi.fn(async () => showbiz) },
  mbByUrl: vi.fn(async () => null),
  mbByBarcode: vi.fn(async () => "rg-showbiz"),
  mbByArtistTitle: vi.fn(async () => null),
  albumLinks: vi.fn(async () => ({
    title: "Showbiz!",
    artist: "MIKE",
    links: [
      {
        type: Adapter.AppleMusic,
        url: "https://music.apple.com/album/1788674268",
        via: "musicbrainz" as const,
      },
      { type: Adapter.Spotify, url: SPOTIFY, via: "musicbrainz" as const },
    ],
  })),
  fallbackLinks: vi.fn(async () => []),
  ...over,
});

describe("resolveMusicLink", () => {
  it("finds the MusicBrainz album by URL, then barcode, then exact artist + title", async () => {
    const d = deps();
    const res = await resolveMusicLink(`${SPOTIFY}?si=x`, d);
    expect(d.mbByUrl).toHaveBeenCalledWith(SPOTIFY);
    expect(d.mbByBarcode).toHaveBeenCalledWith("5056818801693");
    expect(d.mbByArtistTitle).not.toHaveBeenCalled();
    expect(d.albumLinks).toHaveBeenCalledWith("rg-showbiz", {
      spotifyUrl: SPOTIFY,
    });
    expect(res).toMatchObject({
      title: "Showbiz!",
      mbid: "rg-showbiz",
      imageUrl: "img",
    });
    // The pasted link is kept as-is; the rest in card order.
    expect(res.links).toEqual([
      { type: Adapter.Spotify, url: SPOTIFY, via: "source" },
      {
        type: Adapter.AppleMusic,
        url: "https://music.apple.com/album/1788674268",
        via: "musicbrainz",
      },
    ]);
  });

  it("works from MusicBrainz alone for platforms without a public API", async () => {
    const d = deps({ mbByUrl: vi.fn(async () => "rg-showbiz") });
    const res = await resolveMusicLink("https://tidal.com/album/409315982", d);
    expect(res.mbid).toBe("rg-showbiz");
    expect(res.links[res.links.length - 1]).toEqual({
      type: Adapter.Tidal,
      url: "https://tidal.com/album/409315982",
      via: "source",
    });
  });

  it("falls back to exact platform lookups when MusicBrainz doesn't know the album", async () => {
    const d = deps({
      mbByBarcode: vi.fn(async () => null),
      fallbackLinks: vi.fn(async () => [
        {
          type: Adapter.Deezer,
          url: "https://www.deezer.com/album/692746351",
          via: "barcode" as const,
        },
      ]),
    });
    const res = await resolveMusicLink(SPOTIFY, d);
    expect(d.mbByArtistTitle).toHaveBeenCalledWith("MIKE", "Showbiz!");
    expect(d.albumLinks).not.toHaveBeenCalled();
    expect(res.mbid).toBeNull();
    expect(res.links.map((l) => l.type)).toEqual([
      Adapter.Spotify,
      Adapter.Deezer,
    ]);
  });

  it("links a track to its album", async () => {
    const d = deps();
    await resolveMusicLink("https://open.spotify.com/track/abc1234567890", d);
    expect(d.platformAlbum[Adapter.Spotify]).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "track", id: "abc1234567890" })
    );
    expect(d.mbByUrl).toHaveBeenCalledWith(SPOTIFY);
  });

  it("refuses unsupported links", async () => {
    await expect(
      resolveMusicLink("https://example.com/x", deps())
    ).rejects.toBeInstanceOf(UnsupportedLinkError);
  });
});
