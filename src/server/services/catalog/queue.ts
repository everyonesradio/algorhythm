import type { IngestJob, PrismaClient } from "@prisma/client";

import type { Embedder } from "@/lib/embeddings/embedder";

import type { IngestOptions, IngestOutcome } from "./ingest";
import type { MbReleaseGroup } from "./musicbrainz";
import { decideVinyl, type VinylStatus } from "./vinyl-status";

export const REFRESH_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
export const STALE_RUNNING_MS = 15 * 60 * 1000;
export const MAX_ATTEMPTS = 3;
export const FAILED_RETRY_MS = 24 * 60 * 60 * 1000;
export const CATALOG_LIMIT = 40;
export const DISCOGRAPHY_LIMIT = 100;

export type Trigger = "scan_match" | "scan_confirm" | "scan_pick" | "cli";

export const isDue = (
  job: Pick<IngestJob, "status" | "attempts" | "startedAt" | "finishedAt">,
  now = Date.now()
): boolean => {
  switch (job.status) {
    case "pending":
      return true;
    case "running":
      return (
        !!job.startedAt && now - job.startedAt.getTime() > STALE_RUNNING_MS
      );
    case "failed":
      return (
        job.attempts < MAX_ATTEMPTS ||
        (!!job.finishedAt && now - job.finishedAt.getTime() > FAILED_RETRY_MS)
      );
    case "done":
      return (
        !!job.finishedAt && now - job.finishedAt.getTime() > REFRESH_AFTER_MS
      );
    default:
      return false;
  }
};

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
      return null;
    }
  }
  if (!isDue(existing, now)) return null;
  await prisma.ingestJob.update({
    where: { id: existing.id },
    data: { ...requeue(existing), trigger },
  });
  return existing.id;
};

export const requeue = (job: Pick<IngestJob, "status" | "attempts">) => ({
  status: "pending" as const,
  error: null,
  ...(job.status === "failed" && job.attempts >= MAX_ATTEMPTS
    ? { attempts: 0 }
    : {}),
});

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
  vinylReleases: (artistMbid: string) => Promise<Map<string, number>>;
  discogsVinyl: (artist: string, title: string) => Promise<number | null>;
  prefetchLinks?: (releaseGroupMbid: string) => Promise<void>;
  saveVinyl: (releaseGroupMbid: string, vinyl: VinylStatus) => Promise<void>;
  ingest: (
    embedder: Embedder,
    mbid: string,
    opts: IngestOptions
  ) => Promise<IngestOutcome>;
  embedder: () => Promise<Embedder>;
  log?: (msg: string) => void;
};

export const runArtistJob = async (
  prisma: PrismaClient,
  jobId: string,
  deps: RunnerDeps
) => {
  const job = await prisma.ingestJob.findUniqueOrThrow({
    where: { id: jobId },
  });
  const log = deps.log ?? (() => undefined);
  const vinylOf = new Map<string, VinylStatus>();
  const stats = {
    releases: 0,
    vinyl: 0,
    notVinyl: 0,
    unknown: 0,
    added: 0,
    skipped: 0,
    noCover: 0,
    failed: 0,
  };
  try {
    const groups = await deps.discography(job.key, DISCOGRAPHY_LIMIT);
    const mbVinyl = await deps.vinylReleases(job.key);
    stats.releases = groups.length;

    const toIngest: MbReleaseGroup[] = [];
    for (const rg of groups) {
      const vinyl = await decideVinyl(mbVinyl.get(rg.id) ?? 0, () =>
        deps.discogsVinyl(job.label, rg.title)
      );
      await deps.saveVinyl(rg.id, vinyl).catch(() => undefined);
      if (vinyl.status === "yes") stats.vinyl++;
      else if (vinyl.status === "no") stats.notVinyl++;
      else stats.unknown++;
      if (vinyl.status === "yes" && toIngest.length < CATALOG_LIMIT) {
        toIngest.push(rg);
        vinylOf.set(rg.id, vinyl);
      }
    }
    log(
      `[ingest] ${job.label}: ${groups.length} releases, ${stats.vinyl} on vinyl` +
        ` (${stats.notVinyl} not, ${stats.unknown} unknown)`
    );

    const embedder = toIngest.length ? await deps.embedder() : null;
    for (const rg of toIngest) {
      if (!embedder) break;
      try {
        const res = await deps.ingest(embedder, rg.id, { augment: true });
        await deps.saveVinyl(rg.id, vinylOf.get(rg.id)!).catch(() => undefined);
        if (res.status === "added") stats.added++;
        else if (res.status === "skipped") stats.skipped++;
        else if (res.status === "no-cover") stats.noCover++;
        if (res.status === "added" || res.status === "skipped") {
          await deps.prefetchLinks?.(rg.id).catch(() => undefined);
        }
      } catch (err) {
        stats.failed++;
        log(
          `[ingest] ${job.label}: ${rg.title} failed: ${(err as Error).message}`
        );
      }
    }
    await prisma.ingestJob.update({
      where: { id: jobId },
      data: {
        status: "done",
        stats,
        finishedAt: new Date(),
        error: null,
        attempts: 0,
      },
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
