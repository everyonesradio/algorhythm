import type { IngestJob, PrismaClient } from "@prisma/client";

import type { Embedder } from "@/lib/embeddings/embedder";

import type { IngestOptions, IngestOutcome } from "./ingest";
import type { MbReleaseGroup } from "./musicbrainz";

/**
 * Scan-triggered catalog ingest.
 *
 * When a scan identifies an album (matched, confirmed, or picked from the
 * artist's discography) we request that artist's whole catalog: every album
 * and EP gets its cover vectorised so the next record from the same artist
 * matches instantly.
 *
 * Jobs live in Mongo (IngestJob) so they survive restarts and cold starts:
 * the scan request starts the work in the background right away, and
 * `npm run vinyl:worker` finishes anything that was cut short.
 */

/** Re-ingest an artist after this long (new releases, new pressings). */
export const REFRESH_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
/** A job "running" longer than this is assumed dead (crashed instance). */
export const STALE_RUNNING_MS = 15 * 60 * 1000;
export const MAX_ATTEMPTS = 3;
/** Newest releases first; cap per artist to bound the work per scan. */
export const CATALOG_LIMIT = 40;

export type Trigger = "scan_match" | "scan_confirm" | "scan_pick" | "cli";

/** Pure: should an existing job be (re)queued? */
export const isDue = (
  job: Pick<IngestJob, "status" | "attempts" | "startedAt" | "finishedAt">,
  now = Date.now()
): boolean => {
  switch (job.status) {
    case "pending":
      return true;
    case "running":
      return !!job.startedAt && now - job.startedAt.getTime() > STALE_RUNNING_MS;
    case "failed":
      return job.attempts < MAX_ATTEMPTS;
    case "done":
      return !!job.finishedAt && now - job.finishedAt.getTime() > REFRESH_AFTER_MS;
    default:
      return false;
  }
};

/**
 * Record that an artist's catalog is wanted. Returns the job id when there
 * is work to do now, or null when it's already done / in progress.
 */
export const requestArtistCatalog = async (
  prisma: PrismaClient,
  artist: { mbid: string; name: string },
  trigger: Trigger,
  now = Date.now()
): Promise<string | null> => {
  const existing = await prisma.ingestJob.findUnique({
    where: { kind_key: { kind: "artist", key: artist.mbid } },
  });
  if (!existing) {
    try {
      const job = await prisma.ingestJob.create({
        data: {
          kind: "artist",
          key: artist.mbid,
          label: artist.name,
          status: "pending",
          trigger,
        },
        select: { id: true },
      });
      return job.id;
    } catch {
      return null; // another request created it first
    }
  }
  if (!isDue(existing, now)) return null;
  if (existing.status === "failed" && existing.attempts >= MAX_ATTEMPTS) {
    return null;
  }
  await prisma.ingestJob.update({
    where: { id: existing.id },
    data: { status: "pending", trigger, error: null },
  });
  return existing.id;
};

/** Atomically move a job pending -> running. False if someone else has it. */
export const claimJob = async (prisma: PrismaClient, id: string) => {
  const { count } = await prisma.ingestJob.updateMany({
    where: { id, status: "pending" },
    data: {
      status: "running",
      startedAt: new Date(),
      attempts: { increment: 1 },
    },
  });
  return count === 1;
};

export type RunnerDeps = {
  discography: (artistMbid: string, limit: number) => Promise<MbReleaseGroup[]>;
  ingest: (
    embedder: Embedder,
    mbid: string,
    opts: IngestOptions
  ) => Promise<IngestOutcome>;
  embedder: () => Promise<Embedder>;
  log?: (msg: string) => void;
};

/** Run a claimed artist job to completion and record the outcome. */
export const runArtistJob = async (
  prisma: PrismaClient,
  jobId: string,
  deps: RunnerDeps
) => {
  const job = await prisma.ingestJob.findUniqueOrThrow({ where: { id: jobId } });
  const log = deps.log ?? (() => undefined);
  const stats = { releases: 0, added: 0, skipped: 0, noCover: 0, failed: 0 };
  try {
    const embedder = await deps.embedder();
    const groups = await deps.discography(job.key, CATALOG_LIMIT);
    stats.releases = groups.length;
    log(`[ingest] ${job.label}: ${groups.length} releases`);

    for (const rg of groups) {
      try {
        const res = await deps.ingest(embedder, rg.id, { augment: true });
        if (res.status === "added") stats.added++;
        else if (res.status === "skipped") stats.skipped++;
        else if (res.status === "no-cover") stats.noCover++;
      } catch (err) {
        stats.failed++;
        log(`[ingest] ${job.label}: ${rg.title} failed: ${(err as Error).message}`);
      }
    }
    await prisma.ingestJob.update({
      where: { id: jobId },
      data: { status: "done", stats, finishedAt: new Date(), error: null, attempts: 0 },
    });
    log(`[ingest] ${job.label}: done ${JSON.stringify(stats)}`);
  } catch (err) {
    await prisma.ingestJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        stats,
        finishedAt: new Date(),
        error: (err as Error).message.slice(0, 500),
      },
    });
    log(`[ingest] ${job.label}: failed: ${(err as Error).message}`);
  }
  return stats;
};
