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
 *   --augment                  -> 3 photo-like variants + 2 close-up crops
 *                                 (extra vectors)
 *
 * Re-running is safe: albums are upserted by sourceKey and already-embedded
 * albums are skipped unless --force. Confirmed user scans are never deleted.
 */
import "./lib/load-env";

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { PrismaClient } from "@prisma/client";

import {
  ACTIVE_EMBEDDING_MODEL,
  EMBEDDING_MODELS,
  type EmbeddingModelKey,
} from "@/lib/embeddings/config";
import { loadEmbedder } from "@/lib/embeddings/embedder";

import { ingestReleaseGroup } from "@/server/services/catalog/ingest";
import {
  findReleaseGroup,
  type MbReleaseGroup,
  releaseGroupsForArtist,
  releaseGroupsForTag,
} from "@/server/services/catalog/musicbrainz";
import { spotifyEnabled } from "@/server/services/catalog/spotify";

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
const limit = Number.parseInt(values.limit, 10);
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
      const res = await ingestReleaseGroup(prisma, embedder, rg.id, {
        augment: values.augment,
        force: values.force,
        spotify: useSpotify,
        dryRun: values["dry-run"],
      });
      if (res.status === "skipped") {
        stats.skipped++;
      } else if (res.status === "no-cover") {
        log(`${prefix} ✗ no cover art: ${res.title}`);
        stats.noCover++;
      } else {
        log(
          `${prefix} ✓ ${res.album.artist} - ${res.album.title}` +
            ` (${res.album.releaseYear ?? "?"}) vectors=${res.vectors}` +
            (res.spotifyId ? ` spotify=${res.spotifyId}` : "")
        );
        if (res.status === "added") stats.added++;
      }
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
  .finally(() => void prisma.$disconnect());
