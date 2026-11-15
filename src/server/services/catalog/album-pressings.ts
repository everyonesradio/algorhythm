import type { PrismaClient } from "@prisma/client";

import type { Embedder } from "@/lib/embeddings/embedder";

import { discogsFields } from "./ingest";
import type { discogsAlbum as DiscogsAlbumFn } from "./variants";

export const DISCOGS_RECHECK_MS = 30 * 24 * 60 * 60 * 1000;
export const NOT_FOUND_RECHECK_MS = 7 * 24 * 60 * 60 * 1000;

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
  if (album.vinylStatus === "no") return { status: "not-vinyl" };

  // Full credit, not artistName: Discogs may list a collab under the other name.
  const found = await deps.discogsAlbum(embedder, album.artist, album.title, {
    variants: true,
  });
  if (!found) {
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
