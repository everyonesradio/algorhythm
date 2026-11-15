import type { PrismaClient } from "@prisma/client";

import { Adapter } from "@/config/enum";
import type { MbRelease } from "@/server/services/catalog/musicbrainz";

import {
  type AlbumLink,
  linksFromReleases,
  platformOf,
} from "./platform-links";

// Exact sources only, no fuzzy search: a wrong link is worse than none.

export const LINKS_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CACHE_VERSION = 3;

export const LINK_ORDER = [
  Adapter.Spotify,
  Adapter.AppleMusic,
  Adapter.YouTube,
  Adapter.Tidal,
  Adapter.Deezer,
  Adapter.SoundCloud,
];

export type CachedPlatformLinks = {
  version: typeof CACHE_VERSION;
  fetchedAt: string;
  links: AlbumLink[];
};

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
    releases?: MbRelease[];
  },
  deps: LinkDeps
): Promise<AlbumLink[]> => {
  const found = new Map<Adapter, AlbumLink>();
  const missing = (types: Adapter[]) => types.filter((t) => !found.has(t));
  const artist = album.artistName ?? album.artist;

  let barcodes: string[] = [];
  if (album.mbid || album.releases) {
    const releases =
      album.releases ?? (await deps.releases(album.mbid!).catch(() => []));
    const fromMb = linksFromReleases(releases, album.title);
    fromMb.links.forEach((l, t) => found.set(t, l));
    barcodes = fromMb.barcodes.slice(0, 3);
  }

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

  const spotify = album.spotifyUrl ? platformOf(album.spotifyUrl) : null;
  if (spotify && !found.has(Adapter.Spotify)) {
    found.set(Adapter.Spotify, { ...spotify, via: "spotify" });
  }

  return LINK_ORDER.flatMap((t) => {
    const l = found.get(t);
    return l ? [l] : [];
  });
};

export type AlbumLinksResult =
  | { status: "not-found" }
  | { status: "ok"; cached: boolean; links: AlbumLink[] };

export const cacheEntry = (
  links: AlbumLink[],
  now = Date.now()
): CachedPlatformLinks => ({
  version: CACHE_VERSION,
  fetchedAt: new Date(now).toISOString(),
  links,
});

export const freshCachedLinks = (platformLinks: unknown, now = Date.now()) =>
  isCached(platformLinks) && isFresh(platformLinks, now)
    ? platformLinks.links
    : null;

type AlbumRow = {
  mbid: string | null;
  title: string;
  artist: string;
  artistName: string | null;
  spotifyUrl: string | null;
};

export const getAlbumLinks = async (
  prisma: PrismaClient,
  albumId: string,
  deps: LinkDeps,
  now = Date.now(),
  opts: {
    background?: (task: Promise<unknown>) => void;
    onResolved?: (album: AlbumRow, links: AlbumLink[]) => Promise<void>;
  } = {}
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

  const refresh = async () => {
    const links = await resolveAlbumLinks(album, deps);
    // Never cache empty results, so a transient outage isn't frozen in.
    if (links.length > 0) {
      await prisma.album.update({
        where: { id: albumId },
        data: {
          platformLinks: JSON.parse(JSON.stringify(cacheEntry(links, now))),
        },
      });
      await opts.onResolved?.(album, links).catch(() => undefined);
    }
    return links;
  };

  const cached = album.platformLinks;
  if (isCached(cached)) {
    if (isFresh(cached, now))
      return { status: "ok", cached: true, links: cached.links };
    if (opts.background && cached.links.length) {
      opts.background(refresh().catch(() => null));
      return { status: "ok", cached: true, links: cached.links };
    }
  }

  return { status: "ok", cached: false, links: await refresh() };
};
