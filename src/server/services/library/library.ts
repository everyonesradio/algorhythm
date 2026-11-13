import { createHash } from "node:crypto";

import type { Prisma, PrismaClient, ScanEvent } from "@prisma/client";

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
      | "not-yours"
      | "not-found",
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

/** Keep the album's "dug N times" and latest-find date in step with its finds. */
const recount = async (prisma: PrismaClient, albumId: string) => {
  const [count, latest] = await Promise.all([
    prisma.libraryEntry.count({ where: { albumId, hidden: false } }),
    prisma.libraryEntry.findFirst({
      where: { albumId, hidden: false },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);
  await prisma.album.update({
    where: { id: albumId },
    data: { libraryCount: count, libraryLastAt: latest?.createdAt ?? null },
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

/** Distinct reports that hide a find until it's reviewed. */
export const REPORTS_TO_HIDE = 3;
/** Recent finds shown per album: keep it short. */
export const FINDS_SHOWN = 3;

export type LibrarySort = "recent" | "most";

/** Albums with at least one visible find, newest find first or most dug. */
export const listLibrary = async <S extends Prisma.AlbumSelect>(
  prisma: PrismaClient,
  input: {
    sort: LibrarySort;
    genre?: string | null;
    decade?: number | null;
    offset: number;
    limit: number;
  },
  select: S
) => {
  const where: Prisma.AlbumWhereInput = {
    libraryCount: { gt: 0 },
    ...(input.genre ? { genres: { has: input.genre } } : {}),
    ...(input.decade != null
      ? { releaseYear: { gte: input.decade, lt: input.decade + 10 } }
      : {}),
  };
  const albums = await prisma.album.findMany({
    where,
    orderBy:
      input.sort === "most"
        ? [{ libraryCount: "desc" }, { libraryLastAt: "desc" }]
        : [{ libraryLastAt: "desc" }],
    skip: input.offset,
    take: input.limit + 1,
    select,
  });
  const page = albums.slice(
    0,
    input.limit
  ) as unknown as (Prisma.AlbumGetPayload<{
    select: S;
  }> & {
    id: string;
    libraryCount: number | null;
    libraryLastAt: Date | null;
  })[];
  // The latest visible find of each album: its note and the art it matched.
  const latest = await prisma.libraryEntry.findMany({
    where: { albumId: { in: page.map((a) => a.id) }, hidden: false },
    orderBy: { createdAt: "desc" },
    select: { albumId: true, note: true, coverUrl: true },
  });
  const byAlbum = new Map<string, (typeof latest)[number]>();
  for (const f of latest)
    if (!byAlbum.has(f.albumId)) byAlbum.set(f.albumId, f);
  return {
    items: page.map((album) => {
      const find = byAlbum.get(album.id);
      return {
        album,
        count: album.libraryCount ?? 0,
        lastFoundAt: album.libraryLastAt,
        latestNote: find?.note ?? null,
        coverUrl: find?.coverUrl ?? null,
      };
    }),
    nextOffset: albums.length > input.limit ? input.offset + input.limit : null,
  };
};

/** Counter for the library header. */
export const libraryStats = async (prisma: PrismaClient) => {
  const [finds, records] = await Promise.all([
    prisma.libraryEntry.count({ where: { hidden: false } }),
    prisma.album.count({ where: { libraryCount: { gt: 0 } } }),
  ]);
  return { finds, records };
};

/** Genres and decades present in the library, for the filter chips. */
export const libraryFacets = async (prisma: PrismaClient) => {
  const albums = await prisma.album.findMany({
    where: { libraryCount: { gt: 0 } },
    select: { genres: true, releaseYear: true },
    take: 2000,
  });
  const genres = new Map<string, number>();
  const decades = new Set<number>();
  for (const a of albums) {
    for (const g of a.genres) genres.set(g, (genres.get(g) ?? 0) + 1);
    if (a.releaseYear) decades.add(Math.floor(a.releaseYear / 10) * 10);
  }
  return {
    genres: [...genres.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 10)
      .map(([g]) => g),
    decades: [...decades].sort((a, b) => a - b),
  };
};

/** The latest few finds of one album: notes and dates, nothing personal. */
export const albumFinds = async (
  prisma: PrismaClient,
  input: { albumId: string; deviceKey?: string | null; limit?: number }
) => {
  const keyHash = input.deviceKey ? hashDeviceKey(input.deviceKey) : null;
  const [count, finds] = await Promise.all([
    prisma.libraryEntry.count({
      where: { albumId: input.albumId, hidden: false },
    }),
    prisma.libraryEntry.findMany({
      where: { albumId: input.albumId, hidden: false },
      orderBy: { createdAt: "desc" },
      take: input.limit ?? FINDS_SHOWN,
      select: {
        id: true,
        note: true,
        createdAt: true,
        deviceKeyHash: true,
        reporters: true,
      },
    }),
  ]);
  return {
    count,
    finds: finds.map((f) => ({
      id: f.id,
      note: f.note,
      createdAt: f.createdAt,
      mine: !!keyHash && f.deviceKeyHash === keyHash,
      reported: !!keyHash && f.reporters.includes(keyHash),
    })),
  };
};

/**
 * Report a find. Three reports from different phones hide it until it's
 * reviewed; a phone reporting twice counts once, and you can't report your
 * own (remove it instead).
 */
export const reportFind = async (
  prisma: PrismaClient,
  input: { entryId: string; deviceKey: string }
) => {
  const entry = await prisma.libraryEntry.findUnique({
    where: { id: input.entryId },
    select: {
      albumId: true,
      deviceKeyHash: true,
      reporters: true,
      hidden: true,
    },
  });
  if (!entry) throw new LibraryError("not-found", "That find is gone.");
  const keyHash = hashDeviceKey(input.deviceKey);
  if (entry.deviceKeyHash === keyHash) {
    throw new LibraryError(
      "not-yours",
      "You can remove your own find instead."
    );
  }
  const wasHidden = entry.hidden;
  if (entry.reporters.includes(keyHash)) return { hidden: wasHidden };
  const reporters = [...entry.reporters, keyHash];
  const hidden = wasHidden || reporters.length >= REPORTS_TO_HIDE;
  await prisma.libraryEntry.update({
    where: { id: input.entryId },
    data: { reporters, hidden },
  });
  if (hidden && !wasHidden) await recount(prisma, entry.albumId);
  return { hidden };
};
