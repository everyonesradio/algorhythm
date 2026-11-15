import type { PrismaClient } from "@prisma/client";

import type { MbMediaRelease } from "./musicbrainz";
import {
  decideVinyl,
  vinylFields,
  vinylReleasesByGroup,
  type VinylStatus,
} from "./vinyl-status";

export type CleanupDeps = {
  releasesByArtist: (artistMbid: string) => Promise<MbMediaRelease[]>;
  releasesByReleaseGroup: (mbid: string) => Promise<MbMediaRelease[]>;
  discogsVinyl: (artist: string, title: string) => Promise<number | null>;
  log?: (msg: string) => void;
};

type AlbumRow = {
  id: string;
  mbid: string | null;
  title: string;
  artist: string;
  artistName: string | null;
  artistMbid: string | null;
};

// MusicBrainz's Various Artists: browsing it pages tens of thousands of releases.
export const VARIOUS_ARTISTS_MBID = "89ad4ac3-39f7-470e-963a-56509c546377";

const canBrowseArtist = (artistMbid: string | null) =>
  Boolean(artistMbid && artistMbid !== VARIOUS_ARTISTS_MBID);

export const recordVinylStatus = async (
  prisma: PrismaClient,
  deps: CleanupDeps,
  opts: { recheck?: boolean; dryRun?: boolean; now?: Date } = {}
) => {
  const log = deps.log ?? (() => undefined);
  const albums: AlbumRow[] = await prisma.album.findMany({
    where: opts.recheck
      ? {}
      : {
          OR: [
            { vinylStatus: null },
            { vinylStatus: { isSet: false } },
            { vinylStatus: "unknown" },
          ],
        },
    select: {
      id: true,
      mbid: true,
      title: true,
      artist: true,
      artistName: true,
      artistMbid: true,
    },
  });
  log(`${albums.length} albums to check`);

  const byArtist = new Map<string, Map<string, number>>();
  const mbVinylFor = async (a: AlbumRow) => {
    if (!a.mbid) return 0;
    if (canBrowseArtist(a.artistMbid)) {
      const artistMbid = a.artistMbid!;
      if (!byArtist.has(artistMbid)) {
        const releases = await deps
          .releasesByArtist(artistMbid)
          .catch(() => []);
        byArtist.set(artistMbid, vinylReleasesByGroup(releases));
      }
      const n = byArtist.get(artistMbid)!.get(a.mbid);
      if (n !== undefined) return n;
    }
    const releases = await deps.releasesByReleaseGroup(a.mbid).catch(() => []);
    return vinylReleasesByGroup(releases).get(a.mbid) ?? 0;
  };

  const results: { album: AlbumRow; vinyl: VinylStatus }[] = [];
  for (const album of albums) {
    // Full credit, not artistName: Discogs may list a collab under the other name.
    const vinyl = await decideVinyl(await mbVinylFor(album), () =>
      deps.discogsVinyl(album.artist, album.title)
    );
    results.push({ album, vinyl });
    log(
      `${vinyl.status.padEnd(7)} ${album.artist} - ${album.title}` +
        (vinyl.source ? ` (${vinyl.releases} via ${vinyl.source})` : "")
    );
    if (!opts.dryRun) {
      await prisma.album.update({
        where: { id: album.id },
        data: vinylFields(vinyl, opts.now),
      });
    }
  }
  return results;
};

export const pruneCandidates = async (prisma: PrismaClient) => {
  const notVinyl = await prisma.album.findMany({
    where: { vinylStatus: "no" },
    select: {
      id: true,
      title: true,
      artist: true,
      releaseYear: true,
      libraryCount: true,
    },
  });
  const scanned = new Set(
    (
      await prisma.coverEmbedding.findMany({
        where: {
          albumId: { in: notVinyl.map((a) => a.id) },
          source: "user_scan",
        },
        select: { albumId: true },
      })
    ).map((e) => e.albumId)
  );
  const kept = (a: (typeof notVinyl)[number]) =>
    scanned.has(a.id) || (a.libraryCount ?? 0) > 0;
  return {
    prune: notVinyl.filter((a) => !kept(a)),
    keptScanned: notVinyl.filter(kept),
  };
};

export const pruneAlbums = async (prisma: PrismaClient, ids: string[]) => {
  const { count: vectors } = await prisma.coverEmbedding.deleteMany({
    where: { albumId: { in: ids } },
  });
  const { count: albums } = await prisma.album.deleteMany({
    where: { id: { in: ids } },
  });
  return { albums, vectors };
};
