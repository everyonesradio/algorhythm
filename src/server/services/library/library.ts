import { createHash } from "node:crypto";

import type { Prisma, PrismaClient, ScanEvent } from "@prisma/client";

import { scanIsActionable } from "@/server/services/vinyl/scan-log";

// Separate from the recognition index: adding a find never stores vectors.

export const ADDS_PER_HOUR = 120;

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

export const hashDeviceKey = (key: string) =>
  createHash("sha256").update(`algorhythm-library:${key}`).digest("hex");

export const scanIdentified = (
  scan: Pick<ScanEvent, "status" | "topAlbumIds" | "confirmedAlbumId">,
  albumId: string
) =>
  scan.confirmedAlbumId
    ? scan.confirmedAlbumId === albumId
    : scan.status === "matched" && scan.topAlbumIds[0] === albumId;

const recount = async (prisma: PrismaClient, albumId: string) => {
  const [count, latest] = await Promise.all([
    prisma.libraryEntry.count({ where: { albumId } }),
    prisma.libraryEntry.findFirst({
      where: { albumId },
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
  prisma.libraryEntry.count({ where: { albumId } });

export const addFind = async (
  prisma: PrismaClient,
  input: {
    scanId: string;
    albumId: string;
    deviceKey: string;
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
    select: { id: true },
  });

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
      count: await recount(prisma, input.albumId),
      created: !already,
    };
  }

  if (already) {
    return {
      entryId: already.id,
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
    },
    select: { id: true },
  });
  const count = await recount(prisma, input.albumId);
  return { entryId: entry.id, count, created: true };
};

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

export type LibrarySort = "recent" | "most";

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
  return {
    items: page.map((album) => ({
      album,
      count: album.libraryCount ?? 0,
      lastFoundAt: album.libraryLastAt,
    })),
    nextOffset: albums.length > input.limit ? input.offset + input.limit : null,
  };
};

export const libraryStats = async (prisma: PrismaClient) => {
  const [finds, records] = await Promise.all([
    prisma.libraryEntry.count(),
    prisma.album.count({ where: { libraryCount: { gt: 0 } } }),
  ]);
  return { finds, records };
};

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
