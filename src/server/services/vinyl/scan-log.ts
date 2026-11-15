import type { PrismaClient } from "@prisma/client";

export const SCAN_VECTOR_RETENTION_MS = 24 * 60 * 60 * 1000;
export const SCAN_ACTION_WINDOW_MS = 30 * 60 * 1000;
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

export const scanIsActionable = (
  scan: { createdAt: Date; vector: number[] },
  now = Date.now()
) =>
  scan.vector.length > 0 &&
  now - scan.createdAt.getTime() <= SCAN_ACTION_WINDOW_MS;

let lastSweep = 0;
export const maybeSweepScanLog = (prisma: PrismaClient, now = Date.now()) => {
  if (now - lastSweep < SWEEP_EVERY_MS) return null;
  lastSweep = now;
  return dropOldScanVectors(prisma, now).catch(() => 0);
};
