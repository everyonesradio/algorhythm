import type { PrismaClient } from "@prisma/client";

import { Adapter } from "@/config/enum";
import type { MbRelease } from "@/server/services/catalog/musicbrainz";
import type { SearchResult } from "@/server/services/search";

import {
  type AlbumLink,
  linksFromReleases,
  platformOf,
} from "./platform-links";

/**
 * Streaming links for an album, most trustworthy source first, cached on
 * the Album document (`platformLinks`) for 30 days.
 *
 *   1. MusicBrainz: links editors attached to the album's releases.
 *   2. Barcode: Apple Music / Deezer lookups by the release's UPC.
 *   3. Strict search: Apple / Deezer, accepted only on an artist + title
 *      match.
 *   4. The album's own Spotify match.
 *   5. Text search across platforms from the Spotify link, keeping only
 *      results the search verified, for platforms still missing.
 *
 * A wrong link is worse than none: the card shows what's found here and
 * nothing else.
 */

export const LINKS_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const CACHE_VERSION = 2;

/** Order on the card. */
export const LINK_ORDER = [
  Adapter.Spotify,
  Adapter.AppleMusic,
  Adapter.YouTube,
  Adapter.Tidal,
  Adapter.Deezer,
  Adapter.SoundCloud,
];

/** Platforms the any-link search (links router) resolves to. */
export const LINK_ADAPTERS = LINK_ORDER;

/** Shape stored in Album.platformLinks. */
export type CachedPlatformLinks = {
  version: typeof CACHE_VERSION;
  fetchedAt: string; // ISO date
  links: AlbumLink[];
};

export type SearchFn = (args: {
  link: string;
  adapters: Adapter[];
}) => Promise<SearchResult>;

export type LinkDeps = {
  releases: (releaseGroupMbid: string) => Promise<MbRelease[]>;
  byBarcode: Partial<
    Record<Adapter, (upc: string) => Promise<AlbumLink | null>>
  >;
  bySearch: Partial<
    Record<
      Adapter,
      (artist: string, title: string) => Promise<AlbumLink | null>
    >
  >;
  search: SearchFn;
};

const isCached = (value: unknown): value is CachedPlatformLinks => {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<CachedPlatformLinks>;
  return (
    v.version === CACHE_VERSION &&
    typeof v.fetchedAt === "string" &&
    Array.isArray(v.links)
  );
};

export const isFresh = (cached: { fetchedAt: string }, now = Date.now()) =>
  now - new Date(cached.fetchedAt).getTime() < LINKS_TTL_MS;

/** First result that isn't null, trying `fns` in order; errors count as null. */
const firstOf = async (fns: (() => Promise<AlbumLink | null>)[]) => {
  for (const fn of fns) {
    const link = await fn().catch(() => null);
    if (link) return link;
  }
  return null;
};

export const resolveAlbumLinks = async (
  album: {
    mbid: string | null;
    title: string;
    artist: string;
    artistName: string | null;
    spotifyUrl: string | null;
  },
  deps: LinkDeps
): Promise<AlbumLink[]> => {
  const found = new Map<Adapter, AlbumLink>();
  const missing = (types: Adapter[]) => types.filter((t) => !found.has(t));
  const artist = album.artistName ?? album.artist;

  // 1. MusicBrainz relationships (and the barcodes for step 2).
  let barcodes: string[] = [];
  if (album.mbid) {
    const releases = await deps.releases(album.mbid).catch(() => []);
    const fromMb = linksFromReleases(releases, album.title);
    fromMb.links.forEach((l, t) => found.set(t, l));
    barcodes = fromMb.barcodes.slice(0, 3);
  }

  // 2 + 3. Barcode, then strict search, per platform, in parallel.
  const keyed = missing([Adapter.AppleMusic, Adapter.Deezer]);
  const results = await Promise.all(
    keyed.map((type) =>
      firstOf([
        ...barcodes.map(
          (upc) => () => deps.byBarcode[type]?.(upc) ?? Promise.resolve(null)
        ),
        () =>
          deps.bySearch[type]?.(artist, album.title) ?? Promise.resolve(null),
      ])
    )
  );
  results.forEach((l) => l && found.set(l.type, l));

  // 4. Our own Spotify match.
  const spotify = album.spotifyUrl ? platformOf(album.spotifyUrl) : null;
  if (spotify && !found.has(Adapter.Spotify)) {
    found.set(Adapter.Spotify, { ...spotify, via: "spotify" });
  }

  // 5. Verified text-search results for anything still missing.
  const anchor = found.get(Adapter.Spotify)?.url;
  const rest = missing([Adapter.YouTube, Adapter.SoundCloud]);
  if (anchor && rest.length) {
    const res = await deps
      .search({ link: anchor, adapters: rest })
      .catch(() => null);
    for (const l of res?.links ?? []) {
      if (l.isVerified && rest.includes(l.type) && !found.has(l.type)) {
        found.set(l.type, { type: l.type, url: l.url, via: "search" });
      }
    }
  }

  return LINK_ORDER.flatMap((t) => {
    const l = found.get(t);
    return l ? [l] : [];
  });
};

export type AlbumLinksResult =
  | { status: "not-found" }
  | { status: "ok"; cached: boolean; links: AlbumLink[] };

export const getAlbumLinks = async (
  prisma: PrismaClient,
  albumId: string,
  deps: LinkDeps,
  now = Date.now()
): Promise<AlbumLinksResult> => {
  const album = await prisma.album.findUnique({
    where: { id: albumId },
    select: {
      mbid: true,
      title: true,
      artist: true,
      artistName: true,
      spotifyUrl: true,
      platformLinks: true,
    },
  });
  if (!album) return { status: "not-found" };

  const cached = album.platformLinks;
  if (isCached(cached) && isFresh(cached, now)) {
    return { status: "ok", cached: true, links: cached.links };
  }

  const links = await resolveAlbumLinks(album, deps);

  // Only cache useful results, so a transient outage isn't frozen in for
  // 30 days.
  if (links.length > 0) {
    const entry: CachedPlatformLinks = {
      version: CACHE_VERSION,
      fetchedAt: new Date(now).toISOString(),
      links,
    };
    await prisma.album.update({
      where: { id: albumId },
      data: { platformLinks: JSON.parse(JSON.stringify(entry)) },
    });
  }

  return { status: "ok", cached: false, links };
};
