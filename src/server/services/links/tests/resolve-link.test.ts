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
const APPLE = "https://music.apple.com/album/1788674268";
const showbiz = {
  title: "Showbiz!",
  artist: "MIKE",
  upc: "5056818801693",
  url: SPOTIFY,
  imageUrl: "img",
};
const release = { id: "rel-1", title: "Showbiz!" };

const memoryStore = () => {
  const rows = new Map<string, { value: any; stale: boolean }>();
  return {
    rows,
    get: vi.fn(async (url: string) => rows.get(url) ?? null),
    put: vi.fn(async (value: any, urls: string[]) => {
      for (const u of urls) rows.set(u, { value, stale: false });
    }),
  };
};

const rowsOf = (d: ResolveDeps) =>
  (d.store as ReturnType<typeof memoryStore>).rows;

const deps = (over: Partial<ResolveDeps> = {}) => {
  const d = {
    store: memoryStore(),
    platformAlbum: { [Adapter.Spotify]: vi.fn(async () => showbiz) },
    mbReleaseForUrl: vi.fn(async (): Promise<string | null> => "rel-1"),
    mbReleaseForBarcode: vi.fn(async (): Promise<string | null> => null),
    mbRelease: vi.fn(async () => ({
      mbid: "rg-showbiz",
      title: "Showbiz!",
      artist: "MIKE",
      artistName: "MIKE",
      release,
    })),
    mbByArtistTitle: vi.fn(async (): Promise<string | null> => null),
    albumLinks: vi.fn(async (_album: unknown, releases?: unknown[]) => [
      { type: Adapter.AppleMusic, url: APPLE, via: "musicbrainz" as const },
      { type: Adapter.Spotify, url: SPOTIFY, via: "musicbrainz" as const },
      // The whole album (all releases) knows one more platform.
      ...(releases
        ? []
        : [
            {
              type: Adapter.Tidal,
              url: "https://tidal.com/album/409315982",
              via: "musicbrainz" as const,
            },
          ]),
    ]),
    fallbackLinks: vi.fn(async () => []),
    background: vi.fn((task: Promise<unknown>) => void task),
    ...over,
  };
  return d as typeof d & ResolveDeps;
};

describe("resolveMusicLink", () => {
  it("asks MusicBrainz by URL alongside the platform API, then one release lookup", async () => {
    const d = deps();
    const res = await resolveMusicLink(`${SPOTIFY}?si=x`, d);
    expect(d.mbReleaseForUrl).toHaveBeenCalledWith(SPOTIFY);
    expect(d.mbRelease).toHaveBeenCalledWith("rel-1");
    expect(d.mbReleaseForBarcode).not.toHaveBeenCalled();
    expect(d.albumLinks).toHaveBeenCalledWith(
      expect.objectContaining({ mbid: "rg-showbiz", spotifyUrl: SPOTIFY }),
      [release]
    );
    expect(res).toMatchObject({
      title: "Showbiz!",
      artist: "MIKE",
      mbid: "rg-showbiz",
      imageUrl: "img",
    });
    // The pasted link is kept as-is; the rest in card order.
    expect(res.links).toEqual([
      { type: Adapter.Spotify, url: SPOTIFY, via: "source" },
      { type: Adapter.AppleMusic, url: APPLE, via: "musicbrainz" },
    ]);
  });

  it("stores the answer under every platform URL, so any of them is a single read next time", async () => {
    const d = deps();
    await resolveMusicLink(SPOTIFY, d);
    expect([...rowsOf(d).keys()]).toEqual(
      expect.arrayContaining([APPLE, SPOTIFY])
    );

    const again = deps({ store: d.store as any });
    const res = await resolveMusicLink(
      APPLE.replace("/album/", "/gb/album/showbiz/"),
      again
    );
    expect(res.mbid).toBe("rg-showbiz");
    expect(again.mbReleaseForUrl).not.toHaveBeenCalled();
    expect(again.platformAlbum[Adapter.Spotify]).not.toHaveBeenCalled();
  });

  it("fills in the whole album's links in the background", async () => {
    const tasks: Promise<unknown>[] = [];
    const d = deps({
      background: vi.fn((t: Promise<unknown>) => void tasks.push(t)),
    });
    const first = await resolveMusicLink(SPOTIFY, d);
    expect(first.links).toHaveLength(2);
    await Promise.all(tasks);
    expect(
      rowsOf(d)
        .get(SPOTIFY)!
        .value.links.map((l: any) => l.type)
    ).toContain(Adapter.Tidal);
    expect(rowsOf(d).has("https://tidal.com/album/409315982")).toBe(true);
  });

  it("serves a stale answer at once and refreshes it in the background", async () => {
    const d = deps();
    rowsOf(d).set(SPOTIFY, {
      value: {
        title: "old",
        artist: "MIKE",
        imageUrl: null,
        mbid: "rg",
        links: [],
      },
      stale: true,
    });
    const res = await resolveMusicLink(SPOTIFY, d);
    expect(res.title).toBe("old");
    expect(d.background).toHaveBeenCalled();
  });

  it("falls back to the barcode when MusicBrainz doesn't know the URL", async () => {
    const d = deps({
      mbReleaseForUrl: vi.fn(async () => null),
      mbReleaseForBarcode: vi.fn(async () => "rel-1"),
    });
    const res = await resolveMusicLink(SPOTIFY, d);
    expect(d.mbReleaseForBarcode).toHaveBeenCalledWith("5056818801693");
    expect(res.mbid).toBe("rg-showbiz");
  });

  it("works from MusicBrainz alone for platforms without a public API", async () => {
    const d = deps();
    const res = await resolveMusicLink("https://tidal.com/album/409315982", d);
    expect(res.mbid).toBe("rg-showbiz");
    expect(res.links.find((l) => l.type === Adapter.Tidal)).toEqual({
      type: Adapter.Tidal,
      url: "https://tidal.com/album/409315982",
      via: "source",
    });
  });

  it("falls back to exact platform lookups when MusicBrainz doesn't know the album", async () => {
    const d = deps({
      mbReleaseForUrl: vi.fn(async () => null),
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
    expect(d.mbReleaseForUrl).toHaveBeenCalledWith(SPOTIFY);
  });

  it("answers from the platform's own data when MusicBrainz is slow, and stores the full answer later", async () => {
    const tasks: Promise<unknown>[] = [];
    const d = deps({
      budgetMs: 20,
      mbRelease: vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 80));
        return {
          mbid: "rg-showbiz",
          title: "Showbiz!",
          artist: "MIKE",
          artistName: "MIKE",
          release,
        };
      }),
      fallbackLinks: vi.fn(async () => [
        {
          type: Adapter.Deezer,
          url: "https://www.deezer.com/album/692746351",
          via: "barcode" as const,
        },
      ]),
      background: vi.fn((t: Promise<unknown>) => void tasks.push(t)),
    });

    const quick = await resolveMusicLink(SPOTIFY, d);
    expect(quick.mbid).toBeNull();
    expect(quick.links.map((l) => l.type)).toEqual([
      Adapter.Spotify,
      Adapter.Deezer,
    ]);

    await Promise.all(tasks);
    const stored = rowsOf(d).get(SPOTIFY)!.value;
    expect(stored.mbid).toBe("rg-showbiz");
    expect(stored.links.map((l: any) => l.type)).toContain(Adapter.AppleMusic);
  });

  it("refuses unsupported links", async () => {
    await expect(
      resolveMusicLink("https://example.com/x", deps())
    ).rejects.toBeInstanceOf(UnsupportedLinkError);
  });
});
