import type { PrismaClient } from "@prisma/client";

/**
 * Scan log upkeep. Each logged scan keeps its 512-number vector (~6.8 KB)
 * so it can become a "user_scan" vector when the user confirms or picks
 * the record, which they can only do for 30 minutes. After that the vector
 * is dead weight that grows with every scan, so it's dropped after a day;
 * the rest of the row (~0.4 KB: status, candidates, scores, what the user
 * confirmed) stays for analytics.
 */
export const SCAN_VECTOR_RETENTION_MS = 24 * 60 * 60 * 1000;
/** How long after a scan it can still be confirmed or picked. */
export const SCAN_ACTION_WINDOW_MS = 30 * 60 * 1000;
/** Sweep at most this often per server instance. */
const SWEEP_EVERY_MS = 15 * 60 * 1000;

export const dropOldScanVectors = async (
  prisma: PrismaClient,
  now = Date.now()
) => {
  const { count } = await prisma.scanEvent.updateMany({
    where: {
      createdAt: { lt: new Date(now - SCAN_VECTOR_RETENTION_MS) },
      vector: { isEmpty: false },
    },
    data: { vector: [] },
  });
  return count;
};

/** Can this scan still be turned into a user_scan vector? */
export const scanIsActionable = (
  scan: { createdAt: Date; vector: number[] },
  now = Date.now()
) =>
  scan.vector.length > 0 &&
  now - scan.createdAt.getTime() <= SCAN_ACTION_WINDOW_MS;

let lastSweep = 0;
/**
 * Run the sweep in the background now and then, piggybacking on scans:
 * no scheduler needed, and an indexed range update is cheap.
 */
export const maybeSweepScanLog = (prisma: PrismaClient, now = Date.now()) => {
  if (now - lastSweep < SWEEP_EVERY_MS) return null;
  lastSweep = now;
  return dropOldScanVectors(prisma, now).catch(() => 0);
};
