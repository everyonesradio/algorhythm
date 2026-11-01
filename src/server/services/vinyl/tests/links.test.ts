import { beforeEach, describe, expect, it, vi } from "vitest";

import { Adapter, MetadataType } from "@/config/enum";
import type { SearchResult } from "@/server/services/search";
import {
  type CachedPlatformLinks,
  getAlbumLinks,
  LINKS_TTL_MS,
} from "@/server/services/vinyl/links";

const SPOTIFY = "https://open.spotify.com/album/abc123";
const NOW = Date.parse("2026-11-01T00:00:00Z");

const result = (source = SPOTIFY, n = 2): SearchResult => ({
  id: "x",
  type: MetadataType.Album,
  title: "Blonde",
  description: "Frank Ocean · Album",
  image: "img",
  source,
  universalLink: "u",
  links: [
    { type: Adapter.YouTube, url: "https://music.youtube.com/x", isVerified: true },
    { type: Adapter.AppleMusic, url: "https://music.apple.com/x", isVerified: true },
  ].slice(0, n),
});

/** Minimal stand-in for the two Prisma calls getAlbumLinks makes. */
const fakePrisma = (album: Record<string, any> | null) => {
  const update = vi.fn(async ({ data }: any) => {
    Object.assign(album!, data);
    return album;
  });
  return {
    prisma: {
      album: { findUnique: vi.fn(async () => album), update },
    } as any,
    update,
  };
};

describe("getAlbumLinks", () => {
  let searchFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    searchFn = vi.fn(async () => result());
  });

  it("searches on a cache miss and stores the result on the album", async () => {
    const album = { spotifyUrl: SPOTIFY, platformLinks: null };
    const { prisma, update } = fakePrisma(album);

    const res = await getAlbumLinks(prisma, "id", searchFn, NOW);

    expect(res).toMatchObject({ status: "ok", cached: false });
    expect(searchFn).toHaveBeenCalledWith({
      link: SPOTIFY,
      adapters: expect.arrayContaining([Adapter.YouTube, Adapter.Tidal]),
    });
    expect(update).toHaveBeenCalledOnce();
    expect((album.platformLinks as unknown as CachedPlatformLinks).fetchedAt).toBe(
      new Date(NOW).toISOString()
    );
  });

  it("serves a fresh cached entry without searching", async () => {
    const cached: CachedPlatformLinks = {
      fetchedAt: new Date(NOW - 1000).toISOString(),
      result: result(),
    };
    const { prisma, update } = fakePrisma({ spotifyUrl: SPOTIFY, platformLinks: cached });

    const res = await getAlbumLinks(prisma, "id", searchFn, NOW);

    expect(res).toMatchObject({ status: "ok", cached: true });
    expect(searchFn).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("refreshes an expired entry", async () => {
    const cached: CachedPlatformLinks = {
      fetchedAt: new Date(NOW - LINKS_TTL_MS - 1).toISOString(),
      result: result(),
    };
    const { prisma } = fakePrisma({ spotifyUrl: SPOTIFY, platformLinks: cached });

    const res = await getAlbumLinks(prisma, "id", searchFn, NOW);

    expect(res).toMatchObject({ status: "ok", cached: false });
    expect(searchFn).toHaveBeenCalledOnce();
  });

  it("re-searches when the album's Spotify URL changed", async () => {
    const cached: CachedPlatformLinks = {
      fetchedAt: new Date(NOW).toISOString(),
      result: result("https://open.spotify.com/album/OLD"),
    };
    const { prisma } = fakePrisma({ spotifyUrl: SPOTIFY, platformLinks: cached });

    await getAlbumLinks(prisma, "id", searchFn, NOW);
    expect(searchFn).toHaveBeenCalledOnce();
  });

  it("does not cache an empty result", async () => {
    searchFn.mockResolvedValue(result(SPOTIFY, 0));
    const { prisma, update } = fakePrisma({ spotifyUrl: SPOTIFY, platformLinks: null });

    const res = await getAlbumLinks(prisma, "id", searchFn, NOW);

    expect(res).toMatchObject({ status: "ok", cached: false });
    expect(update).not.toHaveBeenCalled();
  });

  it("ignores malformed cache data", async () => {
    const { prisma } = fakePrisma({ spotifyUrl: SPOTIFY, platformLinks: { foo: 1 } });
    await getAlbumLinks(prisma, "id", searchFn, NOW);
    expect(searchFn).toHaveBeenCalledOnce();
  });

  it("reports albums without a Spotify match, and unknown albums", async () => {
    expect(
      await getAlbumLinks(fakePrisma({ spotifyUrl: null }).prisma, "id", searchFn, NOW)
    ).toEqual({ status: "no-spotify" });
    expect(await getAlbumLinks(fakePrisma(null).prisma, "id", searchFn, NOW)).toEqual({
      status: "not-found",
    });
    expect(searchFn).not.toHaveBeenCalled();
  });
});
