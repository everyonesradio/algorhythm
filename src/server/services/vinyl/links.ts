import type { PrismaClient } from "@prisma/client";

import { Adapter } from "@/config/enum";
import type { SearchResult } from "@/server/services/search";

/**
 * Cross-platform streaming links for an album, cached on the Album document.
 *
 * Resolving links scrapes/queries five platforms, so we do it once per album
 * and store the result in `Album.platformLinks`. The in-memory cache in
 * services/cache.ts doesn't survive serverless cold starts or span instances;
 * this does. Entries expire so albums that later land on a new platform
 * eventually pick it up.
 */

export const LINKS_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const LINK_ADAPTERS = [
  Adapter.Spotify,
  Adapter.YouTube,
  Adapter.AppleMusic,
  Adapter.Deezer,
  Adapter.SoundCloud,
  Adapter.Tidal,
];

/** Shape stored in Album.platformLinks. */
export type CachedPlatformLinks = {
  fetchedAt: string; // ISO date
  result: SearchResult;
};

export type SearchFn = (args: {
  link: string;
  adapters: Adapter[];
}) => Promise<SearchResult>;

const isCachedPlatformLinks = (value: unknown): value is CachedPlatformLinks => {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<CachedPlatformLinks>;
  return (
    typeof v.fetchedAt === "string" &&
    !!v.result &&
    typeof v.result.source === "string" &&
    Array.isArray(v.result.links)
  );
};

export const isFresh = (cached: CachedPlatformLinks, now = Date.now()) =>
  now - new Date(cached.fetchedAt).getTime() < LINKS_TTL_MS;

export type AlbumLinksResult =
  | { status: "no-spotify" }
  | { status: "not-found" }
  | { status: "ok"; cached: boolean; links: SearchResult };

export const getAlbumLinks = async (
  prisma: PrismaClient,
  albumId: string,
  searchFn: SearchFn,
  now = Date.now()
): Promise<AlbumLinksResult> => {
  const album = await prisma.album.findUnique({
    where: { id: albumId },
    select: { spotifyUrl: true, platformLinks: true },
  });
  if (!album) return { status: "not-found" };
  // The link search is keyed off a platform URL; Spotify is our anchor.
  if (!album.spotifyUrl) return { status: "no-spotify" };

  const cached = album.platformLinks;
  if (
    isCachedPlatformLinks(cached) &&
    cached.result.source === album.spotifyUrl &&
    isFresh(cached, now)
  ) {
    return { status: "ok", cached: true, links: cached.result };
  }

  const result = await searchFn({
    link: album.spotifyUrl,
    adapters: LINK_ADAPTERS,
  });

  // Only cache useful results, so a transient platform outage isn't frozen in
  // for 30 days.
  if (result.links.length > 0) {
    const entry: CachedPlatformLinks = {
      fetchedAt: new Date(now).toISOString(),
      result,
    };
    await prisma.album.update({
      where: { id: albumId },
      data: { platformLinks: JSON.parse(JSON.stringify(entry)) },
    });
  }

  return { status: "ok", cached: false, links: result };
};
