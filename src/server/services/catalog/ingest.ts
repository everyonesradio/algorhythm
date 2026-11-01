import type { PrismaClient } from "@prisma/client";

import type { Embedder } from "@/lib/embeddings/embedder";

import { discogsEnabled, fetchDiscogsImage } from "./discogs";
import { augmentCover, closeUpViews, toRawImage } from "./images";
import {
  type CatalogAlbum,
  fetchCover,
  fetchImage,
  lookupReleaseGroup,
  toCatalogAlbum,
} from "./musicbrainz";
import { findSpotifyAlbum, spotifyEnabled } from "./spotify";
import { discogsAlbum, type DiscogsAlbumInfo, type VariantView } from "./variants";

/**
 * Add one album to the vinyl index: metadata + every view of its cover as
 * vectors. Shared by the seeding CLI and the scan-triggered catalog ingest.
 *
 * Idempotent: albums that already have generated vectors for this model are
 * skipped unless `force`. Confirmed user scans are never deleted.
 */

export type IngestOptions = {
  /** Photo-like variants + close-up views (5 extra vectors). */
  augment: boolean;
  /** Alternative covers from Discogs vinyl pressings (needs DISCOGS_TOKEN). */
  variants?: boolean;
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
      variants: number;
      spotifyId: string | null;
    };

type View = { source: string; image?: Buffer; vector?: number[]; imageUrl?: string };

/** Embed every view of a cover (variants arrive already embedded). */
const embedViews = async (embedder: Embedder, views: View[]) => {
  const out: { source: string; imageUrl?: string; vector: number[] }[] = [];
  for (const view of views) {
    const vector =
      view.vector ?? (await embedder.embed(await toRawImage(embedder, view.image!)));
    out.push({ source: view.source, imageUrl: view.imageUrl, vector });
  }
  return out;
};

/** The cover plus photo-like and close-up views of it. */
const coverViews = async (cover: Buffer, coverUrl: string, augment: boolean) => {
  const views: View[] = [{ source: "catalog", image: cover, imageUrl: coverUrl }];
  if (augment) {
    for (const img of await augmentCover(cover)) views.push({ source: "augment", image: img });
    // Partial-cover views for scans where the sleeve overflows the frame.
    for (const img of await closeUpViews(cover)) views.push({ source: "closeup", image: img });
  }
  return views;
};

const variantViews = (variants: VariantView[]): View[] =>
  variants.map((v) => ({ source: v.source, vector: v.vector, imageUrl: v.imageUrl }));

/** Upsert the album and replace its generated vectors (user scans stay). */
const storeAlbum = async (
  prisma: PrismaClient,
  model: string,
  sourceKey: string,
  data: Parameters<PrismaClient["album"]["create"]>[0]["data"],
  vectors: { source: string; imageUrl?: string; vector: number[] }[]
) => {
  const { sourceKey: _ignored, ...update } = data;
  const saved = await prisma.album.upsert({
    where: { sourceKey },
    create: { ...data, sourceKey },
    update,
    select: { id: true },
  });
  await prisma.coverEmbedding.deleteMany({
    where: { albumId: saved.id, model, source: { not: "user_scan" } },
  });
  await prisma.coverEmbedding.createMany({
    data: vectors.map((v) => ({
      albumId: saved.id,
      model,
      vector: v.vector,
      source: v.source,
      imageUrl: v.imageUrl ?? null,
    })),
  });
  return saved;
};

const discogsFields = (d: DiscogsAlbumInfo | null) =>
  d
    ? {
        styles: d.styles,
        labels: d.labels,
        discogsMasterId: d.masterId,
        discogsReleaseId: d.releaseId,
        discogsArtistId: d.artistId,
      }
    : {};

const hasGeneratedVectors = async (
  prisma: PrismaClient,
  sourceKey: string,
  model: string
) => {
  const existing = await prisma.album.findUnique({
    where: { sourceKey },
    select: {
      _count: {
        select: { embeddings: { where: { model, source: { not: "user_scan" } } } },
      },
    },
  });
  return !!existing && existing._count.embeddings > 0;
};

/** A MusicBrainz release group, optionally enriched w/ Discogs pressings. */
export const ingestReleaseGroup = async (
  prisma: PrismaClient,
  embedder: Embedder,
  mbid: string,
  opts: IngestOptions
): Promise<IngestOutcome> => {
  const sourceKey = `mb:${mbid}`;
  if (!opts.force && (await hasGeneratedVectors(prisma, sourceKey, embedder.model))) {
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
  const discogs =
    opts.variants && discogsEnabled()
      ? await discogsAlbum(embedder, album.artistName ?? album.artist, album.title, {
          variants: true,
        })
      : null;

  const views = await coverViews(cover, coverUrl, opts.augment);
  if (spotify?.imageUrl) {
    const img = await fetchImage(spotify.imageUrl);
    if (img) views.push({ source: "spotify", image: img, imageUrl: spotify.imageUrl });
  }
  views.push(...variantViews(discogs?.variants ?? []));
  const vectors = await embedViews(embedder, views);

  const outcome = {
    mbid,
    album,
    vectors: vectors.length,
    variants: discogs?.variants.length ?? 0,
    spotifyId: spotify?.id ?? null,
  };
  if (opts.dryRun) return { status: "dry-run", ...outcome };

  await storeAlbum(
    prisma,
    embedder.model,
    sourceKey,
    {
      sourceKey,
      mbid: album.mbid,
      title: album.title,
      artist: album.artist,
      artistMbid: album.artistMbid,
      artistName: album.artistName,
      releaseYear: album.releaseYear,
      primaryType: album.primaryType,
      genres: album.genres,
      tags: album.tags,
      labels: [],
      coverUrl: spotify?.imageUrl ?? coverUrl,
      spotifyId: spotify?.id ?? null,
      spotifyUrl: spotify?.url ?? null,
      ...discogsFields(discogs?.info ?? null),
    },
    vectors
  );
  return { status: "added", ...outcome };
};

export type DiscogsIngestOutcome =
  | { status: "not-found" | "skipped" | "no-cover"; artist: string; title: string }
  | { status: "added" | "dry-run"; info: DiscogsAlbumInfo; vectors: number; variants: number };

/**
 * An album MusicBrainz doesn't have (or has no cover for), built entirely
 * from Discogs: metadata, the master's cover, and its vinyl variants.
 */
export const ingestDiscogsAlbum = async (
  prisma: PrismaClient,
  embedder: Embedder,
  artist: string,
  title: string,
  opts: IngestOptions
): Promise<DiscogsIngestOutcome> => {
  const found = await discogsAlbum(embedder, artist, title, {
    variants: opts.variants ?? true,
  });
  if (!found) return { status: "not-found", artist, title };
  const { info, variants } = found;
  const sourceKey = info.masterId
    ? `discogs:master:${info.masterId}`
    : `discogs:release:${info.releaseId}`;
  if (!opts.force && (await hasGeneratedVectors(prisma, sourceKey, embedder.model))) {
    return { status: "skipped", artist, title };
  }
  const cover = info.coverUrl ? await fetchDiscogsImage(info.coverUrl) : null;
  if (!cover || !info.coverUrl) return { status: "no-cover", artist, title };

  const spotify =
    (opts.spotify ?? true) && spotifyEnabled()
      ? await findSpotifyAlbum(info.artist, info.title)
      : null;
  const views = await coverViews(cover, info.coverUrl, opts.augment);
  views.push(...variantViews(variants));
  const vectors = await embedViews(embedder, views);
  if (opts.dryRun) {
    return { status: "dry-run", info, vectors: vectors.length, variants: variants.length };
  }

  await storeAlbum(
    prisma,
    embedder.model,
    sourceKey,
    {
      sourceKey,
      mbid: null,
      title: info.title,
      artist: info.artist,
      artistName: info.artist,
      releaseYear: info.year,
      primaryType: null,
      genres: info.genres,
      tags: [],
      coverUrl: spotify?.imageUrl ?? info.coverUrl,
      spotifyId: spotify?.id ?? null,
      spotifyUrl: spotify?.url ?? null,
      ...discogsFields(info),
    },
    vectors
  );
  return { status: "added", info, vectors: vectors.length, variants: variants.length };
};
