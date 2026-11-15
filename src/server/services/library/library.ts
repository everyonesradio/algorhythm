import { createHash } from "node:crypto";

import type { Prisma, PrismaClient, ScanEvent } from "@prisma/client";

import { scanIsActionable } from "@/server/services/vinyl/scan-log";

/**
 * The public library: records people have scanned (docs/PUBLIC_LIBRARY.md).
 * Separate from the recognition index: adding a find never stores vectors.
 * A find needs a real, recent scan that identified the album, and each phone
 * counts once per record.
 */

export const NOTE_MAX = 140;
export const ADDS_PER_HOUR = 120;

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

export const hashDeviceKey = (key: string) =>
  createHash("sha256").update(`algorhythm-library:${key}`).digest("hex");

export const cleanNote = (note: string | null | undefined) => {
  const text = (note ?? "")
    .replace(
      /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
  return text ? [...text].slice(0, NOTE_MAX).join("") : null;
};

/** Matched by the app, or confirmed/picked by the person scanning. */
export const scanIdentified = (
  scan: Pick<ScanEvent, "status" | "topAlbumIds" | "confirmedAlbumId">,
  albumId: string
) =>
  scan.confirmedAlbumId
    ? scan.confirmedAlbumId === albumId
    : scan.status === "matched" && scan.topAlbumIds[0] === albumId;

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

const visibleCount = (prisma: PrismaClient, albumId: string) =>
  prisma.libraryEntry.count({ where: { albumId, hidden: false } });

export const addFind = async (
  prisma: PrismaClient,
  input: {
    scanId: string;
    albumId: string;
    deviceKey: string;
    note?: string | null;
  },
  now = Date.now()
) => {
  const scan = await prisma.scanEvent.findUnique({
    where: { id: input.scanId },
  });
  if (!scan) throw new LibraryError("scan-not-found", "Scan not found");

  const fromScan = await prisma.libraryEntry.findUnique({
    where: { scanId: scan.id },
  });
  if (fromScan && fromScan.albumId === input.albumId) {
    return {
      entryId: fromScan.id,
      note: fromScan.note,
      count: await visibleCount(prisma, input.albumId),
      created: false,
    };
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
  if (fromScan && fromScan.deviceKeyHash !== deviceKeyHash) {
    throw new LibraryError(
      "not-yours",
      "This scan was added from another phone."
    );
  }
  const already = await prisma.libraryEntry.findFirst({
    where: { albumId: input.albumId, deviceKeyHash },
    select: { id: true, note: true },
  });

  // The scan was corrected to another record: its find follows.
  if (fromScan) {
    const previousAlbum = fromScan.albumId;
    if (already) {
      await prisma.libraryEntry.delete({ where: { id: fromScan.id } });
    } else {
      await prisma.libraryEntry.update({
        where: { id: fromScan.id },
        data: { albumId: input.albumId },
      });
    }
    await recount(prisma, previousAlbum);
    return {
      entryId: already?.id ?? fromScan.id,
      note: already ? already.note : fromScan.note,
      count: await recount(prisma, input.albumId),
      created: !already,
    };
  }

  if (already) {
    return {
      entryId: already.id,
      note: already.note,
      count: await visibleCount(prisma, input.albumId),
      created: false,
    };
  }

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

  const entry = await prisma.libraryEntry.create({
    data: {
      albumId: input.albumId,
      scanId: scan.id,
      deviceKeyHash,
      note: cleanNote(input.note),
    },
    select: { id: true, note: true },
  });
  const count = await recount(prisma, input.albumId);
  return { entryId: entry.id, note: entry.note, count, created: true };
};

const ownEntry = async (
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
      "Only the phone that added this find can change it."
    );
  }
  return entry;
};

export const removeFind = async (
  prisma: PrismaClient,
  input: { entryId: string; deviceKey: string }
) => {
  const entry = await ownEntry(prisma, input);
  await prisma.libraryEntry.delete({ where: { id: input.entryId } });
  const count = await recount(prisma, entry.albumId);
  return { count };
};

export const setNote = async (
  prisma: PrismaClient,
  input: { entryId: string; deviceKey: string; note: string | null }
) => {
  await ownEntry(prisma, input);
  const note = cleanNote(input.note);
  await prisma.libraryEntry.update({
    where: { id: input.entryId },
    data: { note },
  });
  return { note };
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
  const latest = await prisma.libraryEntry.findMany({
    where: { albumId: { in: page.map((a) => a.id) }, hidden: false },
    orderBy: { createdAt: "desc" },
    select: { albumId: true, note: true },
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
