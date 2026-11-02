import type { PrismaClient } from "@prisma/client";
import { waitUntil } from "@vercel/functions";

import { Adapter } from "@/config/enum";
import {
  findReleaseGroup,
  releaseDetail,
  releaseIdForBarcode,
  releaseIdForUrl,
  releasesWithUrls,
} from "@/server/services/catalog/musicbrainz";
import {
  getSpotifyAlbum,
  spotifyAlbumByUpc,
  spotifyTrackAlbumId,
} from "@/server/services/catalog/spotify";
import {
  cacheEntry,
  freshCachedLinks,
  type LinkDeps,
  LINKS_TTL_MS,
  resolveAlbumLinks,
} from "@/server/services/vinyl/links";
import {
  type AlbumLink,
  appleAlbumById,
  appleByBarcode,
  appleBySearch,
  deezerAlbumById,
  deezerByBarcode,
  deezerBySearch,
  type PlatformAlbum,
} from "@/server/services/vinyl/platform-links";

import {
  type ResolvedLink,
  type ResolveDeps,
  resolveMusicLink,
} from "./resolve-link";

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

/**
 * Store an answer under every platform URL of the album (LinkIndex), and
 * on the catalog album too when it's one of ours, so the drawer and pasted
 * links share one result.
 */
export const indexLinks = async (
  prisma: PrismaClient,
  value: ResolvedLink,
  urls: string[],
  now = Date.now()
) => {
  const data = {
    mbid: value.mbid,
    title: value.title,
    artist: value.artist,
    imageUrl: value.imageUrl,
    links: JSON.parse(JSON.stringify(value.links)),
    fetchedAt: new Date(now),
  };
  await Promise.all(
    urls.map((url) =>
      prisma.linkIndex.upsert({
        where: { url },
        create: { url, ...data },
        update: data,
      })
    )
  );
  if (value.mbid) {
    await prisma.album.updateMany({
      where: { sourceKey: `mb:${value.mbid}` },
      data: {
        platformLinks: JSON.parse(JSON.stringify(cacheEntry(value.links, now))),
      },
    });
  }
};

/** Index a catalog album's links (drawer, ingest) so pastes of them are instant. */
export const indexAlbumLinks = (
  prisma: PrismaClient,
  album: { mbid: string | null; title: string; artist: string },
  links: AlbumLink[]
) =>
  links.length
    ? indexLinks(
        prisma,
        {
          mbid: album.mbid,
          title: album.title,
          artist: album.artist,
          imageUrl: null,
          links,
        },
        links.map((l) => l.url)
      )
    : Promise.resolve();

export const linkResolveDeps = (prisma: PrismaClient): ResolveDeps => ({
  store: {
    get: async (url) => {
      const row = await prisma.linkIndex.findUnique({ where: { url } });
      if (!row) return null;
      return {
        value: {
          title: row.title,
          artist: row.artist,
          imageUrl: row.imageUrl,
          mbid: row.mbid,
          links: row.links as AlbumLink[],
        },
        stale: Date.now() - row.fetchedAt.getTime() > LINKS_TTL_MS,
      };
    },
    put: (value, urls) => indexLinks(prisma, value, urls),
  },
  platformAlbum: {
    [Adapter.Spotify]: (l) => spotifyAlbum(l.id, l.kind),
    [Adapter.AppleMusic]: (l) => appleAlbumById(l.id),
    [Adapter.Deezer]: (l) => deezerAlbumById(l.id, l.kind),
  },
  mbReleaseForUrl: releaseIdForUrl,
  mbReleaseForBarcode: releaseIdForBarcode,
  mbRelease: releaseDetail,
  mbByArtistTitle: async (artist, title) =>
    (await findReleaseGroup(artist, title))?.id ?? null,
  albumLinks: async (album, releases) => {
    if (!releases) {
      // A catalog album with fresh links: no MusicBrainz request at all.
      const ours = await prisma.album.findUnique({
        where: { sourceKey: `mb:${album.mbid}` },
        select: { platformLinks: true },
      });
      const cached = freshCachedLinks(ours?.platformLinks);
      if (cached?.length) return cached;
    }
    return resolveAlbumLinks({ ...album, releases }, albumLinkDeps);
  },
  fallbackLinks: async (album) => {
    // One request per platform: the exact barcode lookup when there is a
    // barcode, else the strict search. Apple's public API allows only ~20
    // requests/minute, so no speculative double calls.
    const found = await Promise.all(
      album.upc
        ? [
            appleByBarcode(album.upc),
            deezerByBarcode(album.upc),
            spotifyAlbumByUpc(album.upc).then((url): AlbumLink | null =>
              url ? { type: Adapter.Spotify, url, via: "barcode" } : null
            ),
          ]
        : [
            appleBySearch(album.artist, album.title),
            deezerBySearch(album.artist, album.title),
          ]
    );
    return found.filter((l): l is AlbumLink => !!l);
  },
  background: (task) => waitUntil(task),
});

/** Resolve any supported music link to the album's links everywhere. */
export const resolveLinkOnServer = (prisma: PrismaClient, raw: string) =>
  resolveMusicLink(raw, linkResolveDeps(prisma));
