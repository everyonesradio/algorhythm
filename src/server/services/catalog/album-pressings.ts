import type { PrismaClient } from "@prisma/client";

import type { Embedder } from "@/lib/embeddings/embedder";

import { discogsFields } from "./ingest";
import type { discogsAlbum as DiscogsAlbumFn } from "./variants";

/**
 * Discogs pressings for the album a scan just identified.
 *
 * The artist-catalog ingest skips Discogs (a 38-album catalog would take
 * minutes at Discogs' 60 req/min), but the *scanned* album is the one the
 * user is holding, so its alternative covers are worth ~8 requests now:
 * the next person holding a different pressing of it will match.
 */

/** Look an album up on Discogs at most this often once it's been found. */
export const DISCOGS_RECHECK_MS = 30 * 24 * 60 * 60 * 1000;
/** Albums Discogs didn't find are retried sooner (typos, transient errors). */
export const NOT_FOUND_RECHECK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Atomically mark the album as being checked. False when it was checked
 * recently or another request got there first, so concurrent scans of the
 * same record don't fetch (and store) its pressings twice.
 */
export const claimAlbumForDiscogs = async (
  prisma: PrismaClient,
  albumId: string,
  now = Date.now()
) => {
  const { count } = await prisma.album.updateMany({
    where: {
      id: albumId,
      OR: [
        { discogsCheckedAt: null },
        { discogsCheckedAt: { isSet: false } },
        { discogsCheckedAt: { lt: new Date(now - DISCOGS_RECHECK_MS) } },
      ],
    },
    data: { discogsCheckedAt: new Date(now) },
  });
  return count === 1;
};

export type PressingsOutcome =
  | { status: "skipped" | "not-found" | "missing" | "not-vinyl" }
  | { status: "added"; variants: number };

export const addPressingsToAlbum = async (
  prisma: PrismaClient,
  embedder: Embedder,
  albumId: string,
  deps: { discogsAlbum: typeof DiscogsAlbumFn },
  now = Date.now()
): Promise<PressingsOutcome> => {
  if (!(await claimAlbumForDiscogs(prisma, albumId, now)))
    return { status: "skipped" };
  const album = await prisma.album.findUnique({
    where: { id: albumId },
    select: { title: true, artist: true, artistName: true, vinylStatus: true },
  });
  if (!album) return { status: "missing" };
  // No vinyl pressings to fetch for an album that was never pressed.
  if (album.vinylStatus === "no") return { status: "not-vinyl" };

  // Full credit — Discogs may list a collab under a different lead than
  // MusicBrainz's artistName (first credit).
  const found = await deps.discogsAlbum(
    embedder,
    album.artist,
    album.title,
    { variants: true }
  );
  if (!found) {
    // Backdate the check so a miss is retried after 7 days, not 30.
    await prisma.album.update({
      where: { id: albumId },
      data: {
        discogsCheckedAt: new Date(
          now - DISCOGS_RECHECK_MS + NOT_FOUND_RECHECK_MS
        ),
      },
    });
    return { status: "not-found" };
  }

  // Replace earlier pressings; catalog, close-up and user-scan vectors stay.
  await prisma.coverEmbedding.deleteMany({
    where: { albumId, model: embedder.model, source: "variant" },
  });
  if (found.variants.length) {
    await prisma.coverEmbedding.createMany({
      data: found.variants.map((v) => ({
        albumId,
        model: embedder.model,
        vector: v.vector,
        source: "variant",
        imageUrl: v.imageUrl || null,
        discogsReleaseId: v.releaseId,
      })),
    });
  }
  await prisma.album.update({
    where: { id: albumId },
    data: discogsFields(found.info),
  });
  return { status: "added", variants: found.variants.length };
};
