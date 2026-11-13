import type { PrismaClient, ScanEvent } from "@prisma/client";

import { startScanIngest } from "@/server/services/catalog/background";

import { scanIsActionable } from "./scan-log";

/** Real-world photos kept per album; more adds little and costs index memory. */
export const MAX_USER_SCANS_PER_ALBUM = 25;

export type ConfirmOutcome =
  | { stored: true; reason: null }
  | {
      stored: false;
      reason: "already-confirmed" | "album-has-enough-scans" | "scan-expired";
    };

/**
 * The user says this scan shows `albumId` (tapped "Yes", picked a candidate,
 * or added the find to the library). Records the confirmation, makes sure
 * the artist's catalog is coming in, and keeps the camera's vector as a
 * "user_scan" embedding: real-world photos (glare, angle, wear) make future
 * scans of the same record more reliable.
 *
 * The caller checks that `albumId` is one the scan actually offered.
 */
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

  // A confirmed record: make sure the rest of this artist's catalog is in.
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
  // Too old: its vector may be gone (scan-log.ts). The confirmation above
  // still counts.
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
