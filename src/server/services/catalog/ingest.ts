import type { PrismaClient } from "@prisma/client";

import type { Embedder } from "@/lib/embeddings/embedder";

import { augmentCover, closeUpViews, toRawImage } from "./images";
import {
  type CatalogAlbum,
  fetchCover,
  fetchImage,
  lookupReleaseGroup,
  toCatalogAlbum,
} from "./musicbrainz";
import { findSpotifyAlbum, spotifyEnabled } from "./spotify";

/**
 * Add one MusicBrainz release group (an "album") to the vinyl index:
 * metadata + every view of its cover as vectors. Shared by the seeding CLI
 * and the scan-triggered catalog ingest.
 *
 * Idempotent: albums that already have vectors for this model are skipped
 * unless `force`. Confirmed user scans are never deleted.
 */

export type IngestOptions = {
  /** Photo-like variants + close-up views (5 extra vectors). */
  augment: boolean;
  /** Re-embed even if the album already has vectors. */
  force?: boolean;
  /** Look up the Spotify album (needs SPOTIFY_CLIENT_ID/SECRET). */
  spotify?: boolean;
  dryRun?: boolean;
};

export type IngestOutcome =
  | { status: "skipped"; mbid: string }
  | { status: "no-cover"; mbid: string; title: string }
  | {
      status: "added" | "dry-run";
      mbid: string;
      album: CatalogAlbum;
      vectors: number;
      spotifyId: string | null;
    };

export const ingestReleaseGroup = async (
  prisma: PrismaClient,
  embedder: Embedder,
  mbid: string,
  opts: IngestOptions
): Promise<IngestOutcome> => {
  const sourceKey = `mb:${mbid}`;
  const existing = await prisma.album.findUnique({
    where: { sourceKey },
    select: {
      id: true,
      _count: {
        select: {
          embeddings: {
            where: { model: embedder.model, source: { not: "user_scan" } },
          },
        },
      },
    },
  });
  if (existing && existing._count.embeddings > 0 && !opts.force) {
    return { status: "skipped", mbid };
  }

  const album = toCatalogAlbum(await lookupReleaseGroup(mbid));
  const fetched = await fetchCover(mbid);
  if (!fetched) return { status: "no-cover", mbid, title: album.title };
  const { url: coverUrl, image: cover } = fetched;

  const spotify =
    (opts.spotify ?? true) && spotifyEnabled()
      ? await findSpotifyAlbum(album.artist, album.title)
      : null;

  // Every view of this cover we want in the index.
  const views: { source: string; image: Buffer; imageUrl?: string }[] = [
    { source: "catalog", image: cover, imageUrl: coverUrl },
  ];
  if (spotify?.imageUrl) {
    const img = await fetchImage(spotify.imageUrl);
    if (img) views.push({ source: "spotify", image: img, imageUrl: spotify.imageUrl });
  }
  if (opts.augment) {
    for (const img of await augmentCover(cover)) {
      views.push({ source: "augment", image: img });
    }
    // Partial-cover views for scans where the sleeve overflows the frame.
    for (const img of await closeUpViews(cover)) {
      views.push({ source: "closeup", image: img });
    }
  }

  const vectors: { source: string; imageUrl?: string; vector: number[] }[] = [];
  for (const view of views) {
    const vector = await embedder.embed(await toRawImage(embedder, view.image));
    vectors.push({ source: view.source, imageUrl: view.imageUrl, vector });
  }

  const outcome = {
    mbid,
    album,
    vectors: vectors.length,
    spotifyId: spotify?.id ?? null,
  };
  if (opts.dryRun) return { status: "dry-run", ...outcome };

  const data = {
    mbid: album.mbid,
    title: album.title,
    artist: album.artist,
    artistMbid: album.artistMbid,
    artistName: album.artistName,
    releaseYear: album.releaseYear,
    primaryType: album.primaryType,
    genres: album.genres,
    tags: album.tags,
    coverUrl: spotify?.imageUrl ?? coverUrl,
    spotifyId: spotify?.id ?? null,
    spotifyUrl: spotify?.url ?? null,
  };
  const saved = await prisma.album.upsert({
    where: { sourceKey },
    create: { sourceKey, labels: [], ...data },
    update: data,
    select: { id: true },
  });

  // Replace generated vectors; keep confirmed user scans.
  await prisma.coverEmbedding.deleteMany({
    where: { albumId: saved.id, model: embedder.model, source: { not: "user_scan" } },
  });
  await prisma.coverEmbedding.createMany({
    data: vectors.map((v) => ({
      albumId: saved.id,
      model: embedder.model,
      vector: v.vector,
      source: v.source,
      imageUrl: v.imageUrl ?? null,
    })),
  });
  return { status: "added", ...outcome };
};
