import type { PrismaClient, ScanEvent } from "@prisma/client";

import { startScanIngest } from "@/server/services/catalog/background";

import { scanIsActionable } from "./scan-log";

export const MAX_USER_SCANS_PER_ALBUM = 25;

export type ConfirmOutcome =
  | { stored: true; reason: null }
  | {
      stored: false;
      reason: "already-confirmed" | "album-has-enough-scans" | "scan-expired";
    };

// The caller must check that `albumId` is one the scan actually offered.
export const confirmScan = async (
  prisma: PrismaClient,
  scan: ScanEvent,
  albumId: string,
  startIngest: typeof startScanIngest = startScanIngest
): Promise<ConfirmOutcome> => {
  if (scan.confirmedAlbumId)
    return { stored: false, reason: "already-confirmed" };

  await prisma.scanEvent.update({
    where: { id: scan.id },
    data: { confirmedAlbumId: albumId, confirmedAt: new Date() },
  });

  const album = await prisma.album.findUnique({
    where: { id: albumId },
    select: { artist: true, artistMbid: true, artistName: true },
  });
  if (album) {
    startIngest(
      prisma,
      {
        albumId,
        artist: {
          mbid: album.artistMbid,
          name: album.artistName ?? album.artist,
        },
      },
      "scan_confirm"
    );
  }

  const existing = await prisma.coverEmbedding.count({
    where: { albumId, model: scan.model, source: "user_scan" },
  });
  if (existing >= MAX_USER_SCANS_PER_ALBUM) {
    return { stored: false, reason: "album-has-enough-scans" };
  }
  // Checked after recording: an expired scan still counts as a confirmation.
  if (!scanIsActionable(scan)) return { stored: false, reason: "scan-expired" };

  await prisma.coverEmbedding.create({
    data: {
      albumId,
      model: scan.model,
      vector: scan.vector,
      source: "user_scan",
    },
  });
  return { stored: true, reason: null };
};
