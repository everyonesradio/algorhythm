import { describe, expect, it } from "vitest";

import {
  ADDS_PER_HOUR,
  addFind,
  listLibrary,
  hashDeviceKey,
  LibraryError,
  removeFind,
  scanIdentified,
} from "@/server/services/library/library";

type Row = Record<string, any>;
const NOW = Date.parse("2026-11-13T18:00:00Z");
const KEY = "device-key-aaaaaaaaaaaaaaaa";
const ALBUM = "a".repeat(24);
const OTHER = "b".repeat(24);

const scanRow = (over: Row = {}): Row => ({
  id: "s".repeat(24),
  model: "clip-vit-b32",
  vector: [0.1, 0.2],
  status: "matched",
  topAlbumIds: [ALBUM, OTHER],
  confirmedAlbumId: null,
  createdAt: new Date(NOW - 60_000),
  ...over,
});

/** Just enough Prisma for the library service. */
const fakePrisma = (scans: Row[]) => {
  const entries: Row[] = [];
  const albums: Row = { [ALBUM]: { id: ALBUM }, [OTHER]: { id: OTHER } };
  let n = 0;
  const matches = (e: Row, where: Row) =>
    Object.entries(where).every(([k, v]) =>
      v && typeof v === "object" && "gte" in v ? e[k] >= v.gte : e[k] === v
    );
  return {
    entries,
    albums,
    prisma: {
      scanEvent: {
        findUnique: async ({ where }: Row) =>
          scans.find((s) => s.id === where.id) ?? null,
      },
      libraryEntry: {
        findFirst: async ({ where }: Row) =>
          entries
            .filter((e) => matches(e, where))
            .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null,
        findUnique: async ({ where }: Row) =>
          entries.find((e) =>
            where.id ? e.id === where.id : e.scanId === where.scanId
          ) ?? null,
        count: async ({ where }: Row) =>
          entries.filter((e) => matches(e, where)).length,
        create: async ({ data }: Row) => {
          const row = {
            id: `e${++n}`,
            createdAt: new Date(NOW),
            ...data,
          };
          entries.push(row);
          return row;
        },
        update: async ({ where, data }: Row) =>
          Object.assign(
            entries.find((e) => e.id === where.id)!,
            data
          ),
        delete: async ({ where }: Row) =>
          entries.splice(
            entries.findIndex((e) => e.id === where.id),
            1
          ),
      },
      album: {
        update: async ({ where, data }: Row) =>
          Object.assign((albums[where.id] ??= { id: where.id }), data),
      },
    } as any,
  };
};

const SCAN = "s".repeat(24);
const add = (prisma: any, over: Row = {}) =>
  addFind(
    prisma,
    { scanId: SCAN, albumId: ALBUM, deviceKey: KEY, ...over } as any,
    NOW
  );

describe("addFind", () => {
  it("adds the record a scan matched and counts it on the album", async () => {
    const { prisma, entries, albums } = fakePrisma([scanRow()]);
    const res = await add(prisma);
    expect(res).toMatchObject({ count: 1, created: true });
    expect(entries[0]).toMatchObject({
      albumId: ALBUM,
      deviceKeyHash: hashDeviceKey(KEY),
    });
    expect(entries[0].deviceKeyHash).not.toContain(KEY);
    expect(albums[ALBUM].libraryCount).toBe(1);
  });

  it("never confirms the scan: the library stays apart from recognition", async () => {
    const scan = scanRow();
    const { prisma } = fakePrisma([scan]);
    await add(prisma);
    expect(scan.confirmedAlbumId).toBeNull();
    expect(prisma.coverEmbedding).toBeUndefined();
  });

  it("accepts a record the person confirmed or picked", async () => {
    const { prisma } = fakePrisma([
      scanRow({ status: "ambiguous", confirmedAlbumId: OTHER }),
    ]);
    await expect(add(prisma, { albumId: OTHER })).resolves.toMatchObject({
      created: true,
    });
  });

  it("refuses a record the scan didn't identify", async () => {
    for (const scan of [
      scanRow({ topAlbumIds: [OTHER, ALBUM] }), // only the runner-up
      scanRow({ status: "ambiguous" }), // nothing chosen yet
      scanRow({ confirmedAlbumId: OTHER }), // the person said it's another one
    ]) {
      const { prisma } = fakePrisma([scan]);
      await expect(add(prisma)).rejects.toMatchObject({
        code: "not-identified",
      });
    }
  });

  it("refuses an old scan", async () => {
    const { prisma } = fakePrisma([
      scanRow({ createdAt: new Date(NOW - 31 * 60 * 1000) }),
    ]);
    await expect(add(prisma)).rejects.toBeInstanceOf(LibraryError);
  });

  it("adds a scan only once", async () => {
    const { prisma, entries } = fakePrisma([scanRow()]);
    const first = await add(prisma);
    const again = await add(prisma);
    expect(again).toMatchObject({
      entryId: first.entryId,
      created: false,
      count: 1,
    });
    expect(entries).toHaveLength(1);
  });

  it("counts each phone once per record, however often it's scanned", async () => {
    const { prisma, entries } = fakePrisma([
      scanRow(),
      scanRow({ id: "t".repeat(24) }),
    ]);
    const first = await add(prisma);
    const rescan = await add(prisma, { scanId: "t".repeat(24) });
    expect(rescan).toMatchObject({
      entryId: first.entryId,
      created: false,
      count: 1,
    });
    expect(entries).toHaveLength(1);
  });

  it("moves the find when the scan is corrected to another record", async () => {
    const scan = scanRow();
    const { prisma, entries, albums } = fakePrisma([scan]);
    await add(prisma);
    scan.confirmedAlbumId = OTHER;
    const res = await add(prisma, { albumId: OTHER });
    expect(res).toMatchObject({ count: 1, created: true });
    expect(entries.map((e) => e.albumId)).toEqual([OTHER]);
    expect(albums[ALBUM].libraryCount).toBe(0);
    expect(albums[OTHER].libraryCount).toBe(1);
  });

  it("limits how many finds one phone adds an hour", async () => {
    const scans = Array.from({ length: ADDS_PER_HOUR + 1 }, (_, i) => {
      const id = String(i).padStart(24, "0");
      return scanRow({ id, topAlbumIds: [id] });
    });
    const { prisma } = fakePrisma(scans);
    for (const s of scans.slice(0, ADDS_PER_HOUR)) {
      await add(prisma, { scanId: s.id, albumId: s.id });
    }
    const last = scans[ADDS_PER_HOUR].id;
    await expect(
      add(prisma, { scanId: last, albumId: last })
    ).rejects.toMatchObject({ code: "too-many" });
  });
});

describe("removeFind", () => {
  it("lets only the adding phone remove a find", async () => {
    const { prisma, albums } = fakePrisma([scanRow()]);
    const { entryId } = await add(prisma);
    await expect(
      removeFind(prisma, { entryId, deviceKey: "someone-else-aaaaaaaaaaa" })
    ).rejects.toMatchObject({ code: "not-yours" });
    expect(await removeFind(prisma, { entryId, deviceKey: KEY })).toEqual({
      count: 0,
    });
    expect(albums[ALBUM].libraryCount).toBe(0);
  });
});

describe("helpers", () => {
  it("knows which album a scan identified", () => {
    expect(
      scanIdentified(
        { status: "matched", topAlbumIds: [ALBUM], confirmedAlbumId: null },
        ALBUM
      )
    ).toBe(true);
    expect(
      scanIdentified(
        { status: "none", topAlbumIds: [], confirmedAlbumId: ALBUM },
        ALBUM
      )
    ).toBe(true);
    expect(
      scanIdentified(
        { status: "matched", topAlbumIds: [ALBUM], confirmedAlbumId: OTHER },
        ALBUM
      )
    ).toBe(false);
  });
});

describe("listing", () => {
  it("lists only albums people have scanned, newest find first", async () => {
    const { prisma, albums } = fakePrisma([]);
    Object.assign(albums[ALBUM], {
      libraryCount: 2,
      libraryLastAt: new Date(NOW - 5000),
    });
    Object.assign(albums[OTHER], {
      libraryCount: 1,
      libraryLastAt: new Date(NOW - 1000),
    });
    albums["c".repeat(24)] = { id: "c".repeat(24), libraryCount: 0 };
    prisma.album.findMany = async ({ take }: Row) =>
      Object.values(albums)
        .filter((a: any) => (a.libraryCount ?? 0) > 0)
        .sort((a: any, b: any) => b.libraryLastAt - a.libraryLastAt)
        .slice(0, take);

    const page = await listLibrary(
      prisma,
      { sort: "recent", offset: 0, limit: 24 },
      { id: true }
    );
    expect(page.items.map((i) => [i.album.id, i.count])).toEqual([
      [OTHER, 1],
      [ALBUM, 2],
    ]);
    expect(page.nextOffset).toBeNull();
  });
});
