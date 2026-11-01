/**
 * Seed the vinyl index: album metadata + cover-art vectors.
 *
 *   npm run vinyl:seed -- --file seeds/albums.json
 *   npm run vinyl:seed -- --artist "Amaarae" --artist "Little Simz" --limit 20
 *   npm run vinyl:seed -- --tag afrobeats --tag "neo soul" --limit 200 --augment
 *
 * Pipeline per album:
 *   MusicBrainz release group  -> metadata (title, artist, year, genres, tags)
 *   Cover Art Archive          -> front cover (catalog vector)
 *   Spotify search             -> spotifyId/url + Spotify artwork (2nd vector)
 *   --augment                  -> 3 photo-like variants (extra vectors)
 *
 * Re-running is safe: albums are upserted by sourceKey and already-embedded
 * albums are skipped unless --force. Confirmed user scans are never deleted.
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { PrismaClient } from "@prisma/client";

import {
  ACTIVE_EMBEDDING_MODEL,
  EMBEDDING_MODELS,
  EmbeddingModelKey,
} from "@/lib/embeddings/config";
import { loadEmbedder } from "@/lib/embeddings/embedder";

import { augmentCover, toRawImage } from "./lib/images";
import {
  CatalogAlbum,
  coverArtUrl,
  fetchImage,
  findReleaseGroup,
  lookupReleaseGroup,
  MbReleaseGroup,
  releaseGroupsForArtist,
  releaseGroupsForTag,
  toCatalogAlbum,
} from "./lib/musicbrainz";
import { findSpotifyAlbum, spotifyEnabled } from "./lib/spotify";

try {
  process.loadEnvFile?.();
} catch {
  // no .env file, rely on the real environment
}

type SeedEntry = { artist: string; album: string } | { mbid: string };

const { values } = parseArgs({
  options: {
    file: { type: "string" },
    artist: { type: "string", multiple: true },
    tag: { type: "string", multiple: true },
    limit: { type: "string", default: "25" },
    model: { type: "string", default: ACTIVE_EMBEDDING_MODEL },
    augment: { type: "boolean", default: false },
    "no-spotify": { type: "boolean", default: false },
    force: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
  },
});

const modelKey = values.model as EmbeddingModelKey;
if (!EMBEDDING_MODELS[modelKey]) {
  throw new Error(`Unknown model "${values.model}"`);
}
const limit = Number.parseInt(values.limit!, 10);
const useSpotify = !values["no-spotify"] && spotifyEnabled();

const prisma = new PrismaClient();

const log = (...args: unknown[]) => console.log("[seed]", ...args);

/** Collect release groups from every requested source, de-duplicated. */
const collectReleaseGroups = async (): Promise<MbReleaseGroup[]> => {
  const found = new Map<string, MbReleaseGroup>();
  const add = (rg: MbReleaseGroup | null) => rg && found.set(rg.id, rg);

  if (values.file) {
    const entries = JSON.parse(readFileSync(values.file, "utf8")) as SeedEntry[];
    for (const entry of entries) {
      if ("mbid" in entry) {
        add({ id: entry.mbid, title: "" });
        continue;
      }
      const rg = await findReleaseGroup(entry.artist, entry.album);
      if (!rg) log(`  ✗ not on MusicBrainz: ${entry.artist} - ${entry.album}`);
      add(rg);
    }
  }
  for (const artist of values.artist ?? []) {
    (await releaseGroupsForArtist(artist, limit)).forEach(add);
  }
  for (const tag of values.tag ?? []) {
    (await releaseGroupsForTag(tag, limit)).forEach(add);
  }
  return [...found.values()];
};

const main = async () => {
  log(`model=${modelKey} spotify=${useSpotify} augment=${values.augment}`);
  if (!useSpotify && !values["no-spotify"]) {
    log("  (set SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET to attach Spotify links)");
  }

  const groups = await collectReleaseGroups();
  log(`${groups.length} release groups to process`);
  if (groups.length === 0) return;

  const embedder = await loadEmbedder(modelKey, { device: "cpu" });
  const stats = { added: 0, skipped: 0, noCover: 0, failed: 0 };

  for (const [i, rg] of groups.entries()) {
    const prefix = `[${i + 1}/${groups.length}]`;
    try {
      const sourceKey = `mb:${rg.id}`;
      const existing = await prisma.album.findUnique({
        where: { sourceKey },
        select: { id: true, _count: { select: { embeddings: { where: { model: modelKey } } } } },
      });
      if (existing && existing._count.embeddings > 0 && !values.force) {
        stats.skipped++;
        continue;
      }

      const album: CatalogAlbum = toCatalogAlbum(await lookupReleaseGroup(rg.id));
      const coverUrl = coverArtUrl(album.mbid);
      const cover = await fetchImage(coverUrl);
      if (!cover) {
        log(`${prefix} ✗ no cover art: ${album.artist} - ${album.title}`);
        stats.noCover++;
        continue;
      }

      const spotify = useSpotify
        ? await findSpotifyAlbum(album.artist, album.title)
        : null;

      // Build every view of this cover we want in the index.
      const views: { source: string; image: Buffer; imageUrl?: string }[] = [
        { source: "catalog", image: cover, imageUrl: coverUrl },
      ];
      if (spotify?.imageUrl) {
        const img = await fetchImage(spotify.imageUrl);
        if (img) views.push({ source: "spotify", image: img, imageUrl: spotify.imageUrl });
      }
      if (values.augment) {
        for (const img of await augmentCover(cover)) {
          views.push({ source: "augment", image: img });
        }
      }

      const vectors = [];
      for (const view of views) {
        const vector = await embedder.embed(await toRawImage(embedder, view.image));
        vectors.push({ ...view, vector });
      }

      log(
        `${prefix} ✓ ${album.artist} - ${album.title}` +
          ` (${album.releaseYear ?? "?"}) vectors=${vectors.length}` +
          (spotify ? ` spotify=${spotify.id}` : "")
      );
      if (values["dry-run"]) continue;

      const data = {
        mbid: album.mbid,
        title: album.title,
        artist: album.artist,
        artistMbid: album.artistMbid,
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
        where: { albumId: saved.id, model: modelKey, source: { not: "user_scan" } },
      });
      await prisma.coverEmbedding.createMany({
        data: vectors.map((v) => ({
          albumId: saved.id,
          model: modelKey,
          vector: v.vector,
          source: v.source,
          imageUrl: v.imageUrl ?? null,
        })),
      });
      stats.added++;
    } catch (err) {
      stats.failed++;
      log(`${prefix} ✗ ${rg.id}: ${(err as Error).message}`);
    }
  }

  log("done", stats);
};

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
