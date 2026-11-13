import { createHash } from "node:crypto";

import type { PrismaClient, ScanEvent } from "@prisma/client";

import type { ConfirmOutcome } from "@/server/services/vinyl/confirm-scan";
import { scanIsActionable } from "@/server/services/vinyl/scan-log";

/**
 * The public library: records diggers have actually found and scanned
 * (docs/PUBLIC_LIBRARY.md). Open and anonymous for now.
 *
 * A find can only be added from a real, recent scan, for the album that scan
 * identified: a confident match, a candidate the user confirmed, or a record
 * they entered by hand. That's what makes it a library of records people
 * held, and it keeps junk out without accounts.
 */

export const NOTE_MAX = 140;
/** Adds per device per hour; generous for a pop-up, tight for a script. */
export const ADDS_PER_HOUR = 30;

export class LibraryError extends Error {
  constructor(
    readonly code:
      | "scan-not-found"
      | "scan-expired"
      | "not-identified"
      | "too-many"
      | "not-yours",
    message: string
  ) {
    super(message);
  }
}

/** Only a hash of the device key is stored. */
export const hashDeviceKey = (key: string) =>
  createHash("sha256").update(`algorhythm-library:${key}`).digest("hex");

/** Plain text, one line of whitespace, at most 140 characters; empty is null. */
export const cleanNote = (note: string | null | undefined) => {
  const text = (note ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? [...text].slice(0, NOTE_MAX).join("") : null;
};

/** Did this scan identify this album (matched, confirmed or picked)? */
export const scanIdentified = (
  scan: Pick<ScanEvent, "status" | "topAlbumIds" | "confirmedAlbumId">,
  albumId: string
) =>
  scan.confirmedAlbumId
    ? scan.confirmedAlbumId === albumId
    : scan.status === "matched" && scan.topAlbumIds[0] === albumId;

export type LibraryDeps = {
  /** Record the scan as confirmed for this album (vinyl/confirm-scan.ts). */
  confirm: (scan: ScanEvent, albumId: string) => Promise<ConfirmOutcome>;
};

const recount = async (prisma: PrismaClient, albumId: string) => {
  const count = await prisma.libraryEntry.count({
    where: { albumId, hidden: false },
  });
  await prisma.album.update({
    where: { id: albumId },
    data: { libraryCount: count },
  });
  return count;
};

export const addFind = async (
  prisma: PrismaClient,
  input: {
    scanId: string;
    albumId: string;
    deviceKey: string;
    note?: string | null;
    coverUrl?: string | null;
  },
  deps: LibraryDeps,
  now = Date.now()
) => {
  const scan = await prisma.scanEvent.findUnique({
    where: { id: input.scanId },
  });
  if (!scan) throw new LibraryError("scan-not-found", "Scan not found");

  // Adding twice (double tap, retry) returns the find already there.
  const existing = await prisma.libraryEntry.findUnique({
    where: { scanId: scan.id },
  });
  if (existing) {
    const count = await prisma.libraryEntry.count({
      where: { albumId: existing.albumId, hidden: false },
    });
    return { entryId: existing.id, count, created: false };
  }

  if (!scanIsActionable(scan, now)) {
    throw new LibraryError(
      "scan-expired",
      "This scan has expired. Scan the record again to add it."
    );
  }
  if (!scanIdentified(scan, input.albumId)) {
    throw new LibraryError(
      "not-identified",
      "This scan didn't identify that record."
    );
  }

  const deviceKeyHash = hashDeviceKey(input.deviceKey);
  const recent = await prisma.libraryEntry.count({
    where: {
      deviceKeyHash,
      createdAt: { gte: new Date(now - 60 * 60 * 1000) },
    },
  });
  if (recent >= ADDS_PER_HOUR) {
    throw new LibraryError(
      "too-many",
      "That's a lot of records in an hour. Try again a bit later."
    );
  }

  // Adding a find says "this is the record": count it as a confirmation.
  if (!scan.confirmedAlbumId) await deps.confirm(scan, input.albumId);

  // Only artwork we already hold for this album (catalog, pressing, Spotify).
  let coverUrl: string | null = null;
  if (input.coverUrl) {
    const known = await prisma.coverEmbedding.findFirst({
      where: { albumId: input.albumId, imageUrl: input.coverUrl },
      select: { id: true },
    });
    if (known) coverUrl = input.coverUrl;
  }

  const entry = await prisma.libraryEntry.create({
    data: {
      albumId: input.albumId,
      scanId: scan.id,
      coverUrl,
      deviceKeyHash,
      note: cleanNote(input.note),
    },
    select: { id: true },
  });
  const count = await recount(prisma, input.albumId);
  return { entryId: entry.id, count, created: true };
};

/** "Dug by N", and whether this scan's find is already in. */
export const findStatus = async (
  prisma: PrismaClient,
  input: { albumId: string; scanId?: string | null; deviceKey?: string | null }
) => {
  const [count, entry] = await Promise.all([
    prisma.libraryEntry.count({
      where: { albumId: input.albumId, hidden: false },
    }),
    input.scanId
      ? prisma.libraryEntry.findUnique({
          where: { scanId: input.scanId },
          select: { id: true, deviceKeyHash: true },
        })
      : Promise.resolve(null),
  ]);
  const mine =
    !!entry &&
    !!input.deviceKey &&
    entry.deviceKeyHash === hashDeviceKey(input.deviceKey);
  return { count, entryId: mine ? entry!.id : null, added: !!entry };
};

/** Undo: only the device that added a find can remove it. */
export const removeFind = async (
  prisma: PrismaClient,
  input: { entryId: string; deviceKey: string }
) => {
  const entry = await prisma.libraryEntry.findUnique({
    where: { id: input.entryId },
    select: { albumId: true, deviceKeyHash: true },
  });
  if (!entry || entry.deviceKeyHash !== hashDeviceKey(input.deviceKey)) {
    throw new LibraryError(
      "not-yours",
      "Only the phone that added this find can remove it."
    );
  }
  await prisma.libraryEntry.delete({ where: { id: input.entryId } });
  const count = await recount(prisma, entry.albumId);
  return { count };
};
