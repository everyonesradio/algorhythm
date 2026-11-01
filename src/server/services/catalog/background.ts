import type { PrismaClient } from "@prisma/client";
import { waitUntil } from "@vercel/functions";

import { ACTIVE_EMBEDDING_MODEL } from "@/lib/embeddings/config";
import { loadEmbedder } from "@/lib/embeddings/embedder";
import { logger } from "@/utils/logger";

import { ingestReleaseGroup } from "./ingest";
import { discographyForArtist } from "./musicbrainz";
import {
  claimJob,
  requestArtistCatalog,
  runArtistJob,
  type RunnerDeps,
  type Trigger,
} from "./queue";

export const serverRunnerDeps = (prisma: PrismaClient): RunnerDeps => ({
  discography: discographyForArtist,
  ingest: (embedder, mbid, opts) =>
    ingestReleaseGroup(prisma, embedder, mbid, opts),
  embedder: () => loadEmbedder(ACTIVE_EMBEDDING_MODEL, { device: "cpu" }),
  log: (msg) => logger.info(msg),
});

/**
 * A scan identified an album: start vectorising the artist's catalog now.
 *
 * Returns immediately. On Vercel, `waitUntil` keeps the function alive
 * after the response is sent; elsewhere the promise simply runs in the
 * long-lived server process. If the work is cut short, the job stays in
 * Mongo and `npm run vinyl:worker` (or the next scan) picks it up.
 */
export const startArtistIngest = (
  prisma: PrismaClient,
  artist: { mbid: string | null; name: string },
  trigger: Trigger
) => {
  const { mbid, name } = artist;
  if (!mbid) return;
  const task = (async () => {
    const jobId = await requestArtistCatalog(prisma, { mbid, name }, trigger);
    if (!jobId || !(await claimJob(prisma, jobId))) return;
    await runArtistJob(prisma, jobId, serverRunnerDeps(prisma));
  })().catch((err) =>
    logger.error(`[ingest] ${name}: ${(err as Error).message}`)
  );
  waitUntil(task);
};
