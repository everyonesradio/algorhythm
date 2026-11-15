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
import {
  discogsAlbum,
  type DiscogsAlbumInfo,
  type VariantView,
} from "./variants";

export type IngestOptions = {
  augment: boolean;
  variants?: boolean;
  force?: boolean;
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

type View = {
  source: string;
  image?: Buffer;
  vector?: number[];
  imageUrl?: string;
  discogsReleaseId?: number;
};
type EmbeddedView = {
  source: string;
  imageUrl?: string;
  discogsReleaseId?: number;
  vector: number[];
};

const embedViews = async (embedder: Embedder, views: View[]) => {
  const out: EmbeddedView[] = [];
  for (const view of views) {
    const vector =
      view.vector ??
      (await embedder.embed(await toRawImage(embedder, view.image!)));
    out.push({
      source: view.source,
      imageUrl: view.imageUrl,
      discogsReleaseId: view.discogsReleaseId,
      vector,
    });
  }
  return out;
};

const coverViews = async (
  cover: Buffer,
  coverUrl: string,
  augment: boolean
) => {
  const views: View[] = [
    { source: "catalog", image: cover, imageUrl: coverUrl },
  ];
  if (augment) {
    for (const img of await augmentCover(cover))
      views.push({ source: "augment", image: img });
    for (const img of await closeUpViews(cover))
      views.push({ source: "closeup", image: img });
  }
  return views;
};

const variantViews = (variants: VariantView[]): View[] =>
  variants.map((v) => ({
    source: v.source,
    vector: v.vector,
    imageUrl: v.imageUrl,
    discogsReleaseId: v.releaseId,
  }));

const storeAlbum = async (
  prisma: PrismaClient,
  model: string,
  sourceKey: string,
  data: Parameters<PrismaClient["album"]["create"]>[0]["data"],
  vectors: EmbeddedView[]
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
      discogsReleaseId: v.discogsReleaseId ?? null,
    })),
  });
  return saved;
};

export const discogsFields = (d: DiscogsAlbumInfo | null) =>
  d
    ? {
        styles: d.styles,
        labels: d.labels,
        discogsMasterId: d.masterId,
        discogsReleaseId: d.releaseId,
        discogsArtistId: d.artistId,
        discogsCheckedAt: new Date(),
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
        select: {
          embeddings: { where: { model, source: { not: "user_scan" } } },
        },
      },
    },
  });
  return !!existing && existing._count.embeddings > 0;
};

export type CoverSources = {
  coverArtArchive: () => Promise<{ url: string; image: Buffer } | null>;
  spotify: () => Promise<string | null>;
  discogs: () => Promise<string | null>;
  download: (url: string) => Promise<Buffer | null>;
};

export const resolveCover = async (
  src: CoverSources
): Promise<{
  url: string;
  image: Buffer;
  from: "caa" | "spotify" | "discogs";
} | null> => {
  let caaError: unknown = null;
  try {
    const caa = await src.coverArtArchive();
    if (caa) return { ...caa, from: "caa" };
  } catch (err) {
    caaError = err;
  }
  for (const from of ["spotify", "discogs"] as const) {
    const url = await src[from]().catch(() => null);
    if (!url) continue;
    const image = await src.download(url).catch(() => null);
    if (image) return { url, image, from };
  }
  if (caaError) throw caaError;
  return null;
};

export const ingestReleaseGroup = async (
  prisma: PrismaClient,
  embedder: Embedder,
  mbid: string,
  opts: IngestOptions
): Promise<IngestOutcome> => {
  const sourceKey = `mb:${mbid}`;
  if (
    !opts.force &&
    (await hasGeneratedVectors(prisma, sourceKey, embedder.model))
  ) {
    return { status: "skipped", mbid };
  }

  const album = toCatalogAlbum(await lookupReleaseGroup(mbid));
  const artist = album.artistName ?? album.artist;

  const spotify =
    (opts.spotify ?? true) && spotifyEnabled()
      ? await findSpotifyAlbum(album.artist, album.title)
      : null;
  let discogs =
    opts.variants && discogsEnabled()
      ? await discogsAlbum(embedder, artist, album.title, { variants: true })
      : null;

  const fetched = await resolveCover({
    coverArtArchive: () => fetchCover(mbid),
    spotify: async () => spotify?.imageUrl ?? null,
    discogs: async () => {
      if (!discogs && discogsEnabled()) {
        discogs = await discogsAlbum(embedder, artist, album.title);
      }
      return discogs?.info.coverUrl ?? null;
    },
    download: (url) =>
      new URL(url).hostname.endsWith("discogs.com")
        ? fetchDiscogsImage(url)
        : fetchImage(url, 3),
  });
  if (!fetched) return { status: "no-cover", mbid, title: album.title };
  const { url: coverUrl, image: cover } = fetched;

  const views = await coverViews(cover, coverUrl, opts.augment);
  if (spotify?.imageUrl && fetched.from !== "spotify") {
    const img = await fetchImage(spotify.imageUrl);
    if (img)
      views.push({ source: "spotify", image: img, imageUrl: spotify.imageUrl });
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
  | {
      status: "not-found" | "skipped" | "no-cover";
      artist: string;
      title: string;
    }
  | {
      status: "added" | "dry-run";
      info: DiscogsAlbumInfo;
      vectors: number;
      variants: number;
    };

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
  if (
    !opts.force &&
    (await hasGeneratedVectors(prisma, sourceKey, embedder.model))
  ) {
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
    return {
      status: "dry-run",
      info,
      vectors: vectors.length,
      variants: variants.length,
    };
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
  return {
    status: "added",
    info,
    vectors: vectors.length,
    variants: variants.length,
  };
};
