import type { PrismaClient } from "@prisma/client";

import { Adapter } from "@/config/enum";
import {
  findReleaseGroup,
  lookupReleaseGroup,
  releaseGroupForBarcode,
  releaseGroupForUrl,
  releasesWithUrls,
  toCatalogAlbum,
} from "@/server/services/catalog/musicbrainz";
import {
  getSpotifyAlbum,
  spotifyTrackAlbumId,
} from "@/server/services/catalog/spotify";
import {
  getAlbumLinks,
  type LinkDeps,
  resolveAlbumLinks,
} from "@/server/services/vinyl/links";
import {
  appleAlbumById,
  appleByBarcode,
  appleBySearch,
  deezerAlbumById,
  deezerByBarcode,
  deezerBySearch,
  type PlatformAlbum,
} from "@/server/services/vinyl/platform-links";

import {
  parseMusicLink,
  type ResolvedLink,
  type ResolveDeps,
  resolveMusicLink,
} from "./resolve-link";

/**
 * Resolving a link costs 3-4 MusicBrainz requests (~4-8s at 1 req/s), so
 * keep recent answers per server instance, keyed by the canonical link.
 */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; value: ResolvedLink }>();

/** Exact link sources: MusicBrainz, barcodes, strict matches. No scraping. */
export const albumLinkDeps: LinkDeps = {
  releases: releasesWithUrls,
  byBarcode: {
    [Adapter.AppleMusic]: appleByBarcode,
    [Adapter.Deezer]: deezerByBarcode,
  },
  bySearch: {
    [Adapter.AppleMusic]: appleBySearch,
    [Adapter.Deezer]: deezerBySearch,
  },
};

const spotifyAlbum = async (
  id: string,
  kind: "album" | "track"
): Promise<PlatformAlbum | null> => {
  const albumId = kind === "track" ? await spotifyTrackAlbumId(id) : id;
  const a = albumId ? await getSpotifyAlbum(albumId) : null;
  return a
    ? {
        title: a.title,
        artist: a.artist,
        upc: a.upc,
        url: a.url,
        imageUrl: a.imageUrl,
      }
    : null;
};

/** Resolve any supported music link to the album's links everywhere. */
export const resolveLinkOnServer = async (
  prisma: PrismaClient,
  raw: string
) => {
  const key = parseMusicLink(raw)?.url;
  const hit = key ? cache.get(key) : undefined;
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const deps: ResolveDeps = {
    platformAlbum: {
      [Adapter.Spotify]: (l) => spotifyAlbum(l.id, l.kind),
      [Adapter.AppleMusic]: (l) => appleAlbumById(l.id),
      [Adapter.Deezer]: (l) => deezerAlbumById(l.id, l.kind),
    },
    mbByUrl: releaseGroupForUrl,
    mbByBarcode: releaseGroupForBarcode,
    mbByArtistTitle: async (artist, title) =>
      (await findReleaseGroup(artist, title))?.id ?? null,
    albumLinks: async (mbid, hint) => {
      // In the catalog: its cached links (30 days).
      const album = await prisma.album.findUnique({
        where: { sourceKey: `mb:${mbid}` },
        select: { id: true, title: true, artist: true },
      });
      if (album) {
        const res = await getAlbumLinks(prisma, album.id, albumLinkDeps);
        return {
          title: album.title,
          artist: album.artist,
          links: res.status === "ok" ? res.links : [],
        };
      }
      const meta = toCatalogAlbum(await lookupReleaseGroup(mbid));
      const links = await resolveAlbumLinks(
        {
          mbid,
          title: meta.title,
          artist: meta.artist,
          artistName: meta.artistName,
          spotifyUrl: hint.spotifyUrl,
        },
        albumLinkDeps
      );
      return { title: meta.title, artist: meta.artist, links };
    },
    fallbackLinks: async (album) => {
      const found = await Promise.all([
        appleBySearch(album.artist, album.title),
        deezerBySearch(album.artist, album.title),
        ...(album.upc
          ? [appleByBarcode(album.upc), deezerByBarcode(album.upc)]
          : []),
      ]);
      return found.filter((l): l is NonNullable<typeof l> => !!l);
    },
  };
  const value = await resolveMusicLink(raw, deps);
  if (key && value.links.length) {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), value });
  }
  return value;
};
