import { describe, expect, it, vi } from "vitest";

import { Adapter, MetadataType } from "@/config/enum";
import type { MbRelease } from "@/server/services/catalog/musicbrainz";
import {
  type CachedPlatformLinks,
  getAlbumLinks,
  type LinkDeps,
  LINKS_TTL_MS,
  resolveAlbumLinks,
} from "@/server/services/vinyl/links";
import {
  pickSameAlbum,
  platformOf,
  rankReleases,
  sameArtist,
} from "@/server/services/vinyl/platform-links";

const NOW = Date.parse("2026-11-02T00:00:00Z");

/** MIKE - Showbiz! as MusicBrainz has it (trimmed). */
const SHOWBIZ: MbRelease[] = [
  {
    id: "deluxe",
    title: "Showbiz! (deluxe)",
    date: "2025-12-11",
    status: "Official",
    barcode: "5056818806834",
    relations: [
      {
        type: "streaming",
        url: { resource: "https://music.apple.com/us/album/1854776696" },
      },
      {
        type: "streaming",
        url: {
          resource: "https://open.spotify.com/album/5irh9q8ColuQQz0kDQXJbQ",
        },
      },
    ],
  },
  {
    id: "standard",
    title: "Showbiz!",
    date: "2025-01-31",
    status: "Official",
    barcode: "5056818801693",
    relations: [
      {
        type: "free streaming",
        url: {
          resource: "https://open.spotify.com/album/3M1PhSsHmAlh79bAz9jBZs",
        },
      },
      {
        type: "streaming",
        url: { resource: "https://music.apple.com/gb/album/1788674268" },
      },
      {
        type: "streaming",
        url: { resource: "https://tidal.com/album/409315982" },
      },
      {
        type: "purchase for download",
        url: { resource: "https://mikelikesrap.bandcamp.com/album/showbiz" },
      },
    ],
  },
];

const showbiz = {
  mbid: "3e8f18f1",
  title: "Showbiz!",
  artist: "MIKE",
  artistName: "MIKE",
  spotifyUrl: null,
};

const deps = (over: Partial<LinkDeps> = {}): LinkDeps => ({
  releases: vi.fn(async () => SHOWBIZ),
  byBarcode: {
    [Adapter.Deezer]: vi.fn(async (upc: string) =>
      upc === "5056818801693"
        ? {
            type: Adapter.Deezer,
            url: "https://www.deezer.com/album/692746351",
            via: "barcode" as const,
          }
        : null
    ),
  },
  bySearch: {},
  search: vi.fn(async () => ({
    id: "x",
    type: MetadataType.Album,
    title: "Showbiz!",
    description: "",
    image: "",
    source: "https://open.spotify.com/album/3M1PhSsHmAlh79bAz9jBZs",
    universalLink: "u",
    links: [
      {
        type: Adapter.YouTube,
        url: "https://music.youtube.com/playlist?list=OK",
        isVerified: true,
      },
      {
        type: Adapter.SoundCloud,
        url: "https://soundcloud.com/someone-else/sets/x",
        isVerified: false,
      },
    ],
  })),
  ...over,
});

describe("resolveAlbumLinks", () => {
  it("uses MusicBrainz's links for the standard release, not the deluxe", async () => {
    const links = await resolveAlbumLinks(showbiz, deps());
    expect(links).toEqual([
      {
        type: Adapter.Spotify,
        url: "https://open.spotify.com/album/3M1PhSsHmAlh79bAz9jBZs",
        via: "musicbrainz",
      },
      {
        type: Adapter.AppleMusic,
        url: "https://music.apple.com/album/1788674268",
        via: "musicbrainz",
      },
      {
        type: Adapter.YouTube,
        url: "https://music.youtube.com/playlist?list=OK",
        via: "search",
      },
      {
        type: Adapter.Tidal,
        url: "https://tidal.com/album/409315982",
        via: "musicbrainz",
      },
      {
        type: Adapter.Deezer,
        url: "https://www.deezer.com/album/692746351",
        via: "barcode",
      },
    ]);
  });

  it("never shows a link the text search couldn't verify", async () => {
    const links = await resolveAlbumLinks(showbiz, deps());
    expect(links.map((l) => l.type)).not.toContain(Adapter.SoundCloud);
  });

  it("falls back to a strict search when MusicBrainz has nothing", async () => {
    const appleSearch = vi.fn(async () => ({
      type: Adapter.AppleMusic,
      url: "https://music.apple.com/album/1",
      via: "search" as const,
    }));
    const links = await resolveAlbumLinks(
      {
        ...showbiz,
        mbid: null,
        spotifyUrl: "https://open.spotify.com/album/abc?si=1",
      },
      deps({ bySearch: { [Adapter.AppleMusic]: appleSearch } })
    );
    expect(appleSearch).toHaveBeenCalledWith("MIKE", "Showbiz!");
    expect(links.slice(0, 2)).toEqual([
      {
        type: Adapter.Spotify,
        url: "https://open.spotify.com/album/abc",
        via: "spotify",
      },
      {
        type: Adapter.AppleMusic,
        url: "https://music.apple.com/album/1",
        via: "search",
      },
    ]);
  });

  it("survives every source failing", async () => {
    const boom = vi.fn(async () => {
      throw new Error("down");
    });
    const links = await resolveAlbumLinks(
      showbiz,
      deps({ releases: boom, search: boom })
    );
    expect(links).toEqual([]);
  });
});

describe("getAlbumLinks cache", () => {
  const fakePrisma = (album: Record<string, any> | null) => {
    const update = vi.fn(async ({ data }: any) => Object.assign(album!, data));
    return {
      prisma: {
        album: { findUnique: vi.fn(async () => album), update },
      } as any,
      update,
    };
  };

  it("resolves on a miss and stores the links on the album", async () => {
    const album = { ...showbiz, platformLinks: null };
    const { prisma, update } = fakePrisma(album);
    const res = await getAlbumLinks(prisma, "id", deps(), NOW);
    expect(res).toMatchObject({ status: "ok", cached: false });
    expect(update).toHaveBeenCalledOnce();
    expect(
      (album.platformLinks as unknown as CachedPlatformLinks).links
    ).toHaveLength(5);
  });

  it("serves fresh cache without touching any source", async () => {
    const cached: CachedPlatformLinks = {
      version: 2,
      fetchedAt: new Date(NOW - 1000).toISOString(),
      links: [],
    };
    const d = deps();
    const res = await getAlbumLinks(
      fakePrisma({ ...showbiz, platformLinks: cached }).prisma,
      "id",
      d,
      NOW
    );
    expect(res).toMatchObject({ status: "ok", cached: true });
    expect(d.releases).not.toHaveBeenCalled();
  });

  it("re-resolves stale and old-format (text search only) entries", async () => {
    const stale: CachedPlatformLinks = {
      version: 2,
      fetchedAt: new Date(NOW - LINKS_TTL_MS - 1).toISOString(),
      links: [],
    };
    const oldFormat = {
      fetchedAt: new Date(NOW).toISOString(),
      result: { source: "s", links: [] },
    };
    for (const platformLinks of [stale, oldFormat]) {
      const d = deps();
      await getAlbumLinks(
        fakePrisma({ ...showbiz, platformLinks }).prisma,
        "id",
        d,
        NOW
      );
      expect(d.releases).toHaveBeenCalledOnce();
    }
  });

  it("doesn't cache an empty result", async () => {
    const { prisma, update } = fakePrisma({
      ...showbiz,
      mbid: null,
      platformLinks: null,
    });
    await getAlbumLinks(prisma, "id", deps(), NOW);
    expect(update).not.toHaveBeenCalled();
  });

  it("reports a missing album", async () => {
    expect(
      await getAlbumLinks(fakePrisma(null).prisma, "id", deps(), NOW)
    ).toEqual({ status: "not-found" });
  });
});

describe("platform links", () => {
  it("canonicalises streaming URLs and ignores everything else", () => {
    expect(
      platformOf("https://music.apple.com/gb/album/showbiz/1788674268")?.url
    ).toBe("https://music.apple.com/album/1788674268");
    expect(platformOf("https://www.deezer.com/fr/album/692746351")?.url).toBe(
      "https://www.deezer.com/album/692746351"
    );
    expect(
      platformOf("https://mikelikesrap.bandcamp.com/album/showbiz")
    ).toBeNull();
    expect(platformOf("https://open.spotify.com/artist/123")).toBeNull();
  });

  it("ranks the standard official release ahead of the deluxe", () => {
    expect(rankReleases(SHOWBIZ, "Showbiz!").map((r) => r.id)).toEqual([
      "standard",
      "deluxe",
    ]);
  });

  it("accepts a search result only when artist and title match", () => {
    const results = [
      { artist: "Mike Posner", title: "Showbiz" },
      { artist: "MIKE", title: "Beware of the Monkey" },
      { artist: "MIKE", title: "Showbiz! (Deluxe Edition)" },
      { artist: "MIKE", title: "Showbiz!" },
    ];
    const pick = (artist: string, title: string) =>
      pickSameAlbum({ artist, title }, results, (r) => r);
    expect(pick("MIKE", "Showbiz!")).toEqual({
      artist: "MIKE",
      title: "Showbiz!",
    });
    expect(pick("MIKE", "Disco!")).toBeUndefined();
    expect(sameArtist("MIKE", "MIKE & DJ Blackpower")).toBe(true);
    expect(sameArtist("MIKE", "Mike Posner")).toBe(false);
  });
});
