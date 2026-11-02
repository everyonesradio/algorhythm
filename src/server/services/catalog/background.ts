import type { PrismaClient } from "@prisma/client";
import { waitUntil } from "@vercel/functions";

import { ACTIVE_EMBEDDING_MODEL } from "@/lib/embeddings/config";
import { loadEmbedder } from "@/lib/embeddings/embedder";
import { logger } from "@/utils/logger";

import { addPressingsToAlbum } from "./album-pressings";
import { discogsEnabled } from "./discogs";
import { runInBackground } from "./rate-lanes";
import { ingestReleaseGroup } from "./ingest";
import { albumLinkDeps, indexAlbumLinks } from "@/server/services/links/server";
import { getAlbumLinks } from "@/server/services/vinyl/links";

import { discogsOfficialVinyl } from "./discogs";
import { discographyForArtist, officialReleasesWithMedia } from "./musicbrainz";
import { vinylFields, vinylReleasesByGroup } from "./vinyl-status";
import {
  claimJob,
  requestArtistCatalog,
  runArtistJob,
  type RunnerDeps,
  type Trigger,
} from "./queue";
import { discogsAlbum } from "./variants";

export const serverRunnerDeps = (prisma: PrismaClient): RunnerDeps => ({
  discography: discographyForArtist,
  vinylReleases: async (artistMbid) =>
    vinylReleasesByGroup(
      await officialReleasesWithMedia({ artist: artistMbid })
    ),
  discogsVinyl: discogsOfficialVinyl,
  saveVinyl: async (mbid, vinyl) => {
    await prisma.album.updateMany({
      where: { sourceKey: `mb:${mbid}` },
      data: vinylFields(vinyl),
    });
  },
  ingest: (embedder, mbid, opts) =>
    ingestReleaseGroup(prisma, embedder, mbid, opts),
  prefetchLinks: async (mbid) => {
    const album = await prisma.album.findUnique({
      where: { sourceKey: `mb:${mbid}` },
      select: { id: true },
    });
    if (!album) return;
    // Cached albums return at once; others cost ~1 MusicBrainz request.
    await getAlbumLinks(prisma, album.id, albumLinkDeps, Date.now(), {
      onResolved: (a, links) => indexAlbumLinks(prisma, a, links),
    });
  },
  embedder: () => loadEmbedder(ACTIVE_EMBEDDING_MODEL, { device: "cpu" }),
  log: (msg) => logger.info(msg),
});

/**
 * A scan identified an album (confident match, "Yes, that's it", or a pick).
 * In the background:
 *   1. that album's Discogs pressings become extra "variant" vectors (once
 *      per 30 days per album), so other pressings of it match too;
 *   2. the artist's whole catalog is vectorised (one job per artist).
 *
 * Returns immediately. On Vercel, `waitUntil` keeps the function alive
 * after the response is sent; elsewhere the promise simply runs in the
 * long-lived server process. If the catalog work is cut short, the job stays
 * in Mongo and `npm run vinyl:worker` (or the next scan) picks it up.
 */
export const startScanIngest = (
  prisma: PrismaClient,
  scanned: {
    albumId: string;
    artist: { mbid: string | null; name: string };
  },
  trigger: Trigger
) => {
  const { albumId, artist } = scanned;
  // Background lane: this work yields external-API slots to people waiting.
  const task = runInBackground(async () => {
    if (discogsEnabled()) {
      try {
        const embedder = await loadEmbedder(ACTIVE_EMBEDDING_MODEL, {
          device: "cpu",
        });
        const res = await addPressingsToAlbum(prisma, embedder, albumId, {
          discogsAlbum,
        });
        if (res.status === "added") {
          logger.info(
            `[pressings] ${artist.name}: ${res.variants} variant covers`
          );
        }
      } catch (err) {
        logger.error(`[pressings] ${artist.name}: ${(err as Error).message}`);
      }
    }
    if (!artist.mbid) return;
    const jobId = await requestArtistCatalog(
      prisma,
      { mbid: artist.mbid, name: artist.name },
      trigger
    );
    if (!jobId || !(await claimJob(prisma, jobId))) return;
    await runArtistJob(prisma, jobId, serverRunnerDeps(prisma));
  }).catch((err) =>
    logger.error(`[ingest] ${artist.name}: ${(err as Error).message}`)
  );
  waitUntil(task);
};
