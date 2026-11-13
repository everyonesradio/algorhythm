import { describe, expect, it, vi } from "vitest";

import {
  ADDS_PER_HOUR,
  addFind,
  cleanNote,
  findStatus,
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
const fakePrisma = (scans: Row[], covers: Row[] = []) => {
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
        findUnique: async ({ where }: Row) =>
          entries.find((e) =>
            where.id ? e.id === where.id : e.scanId === where.scanId
          ) ?? null,
        count: async ({ where }: Row) =>
          entries.filter((e) => matches(e, where)).length,
        create: async ({ data }: Row) => {
          const row = {
            id: `e${++n}`,
            hidden: false,
            createdAt: new Date(NOW),
            ...data,
          };
          entries.push(row);
          return row;
        },
        delete: async ({ where }: Row) =>
          entries.splice(
            entries.findIndex((e) => e.id === where.id),
            1
          ),
      },
      album: {
        update: async ({ where, data }: Row) =>
          Object.assign(albums[where.id], data),
      },
      coverEmbedding: {
        findFirst: async ({ where }: Row) =>
          covers.find(
            (c) => c.albumId === where.albumId && c.imageUrl === where.imageUrl
          ) ?? null,
      },
    } as any,
  };
};

const deps = () => ({
  confirm: vi.fn(async () => ({ stored: true as const, reason: null })),
});

describe("addFind", () => {
  it("adds the record a scan matched, confirms it, and counts it on the album", async () => {
    const { prisma, entries, albums } = fakePrisma([scanRow()]);
    const d = deps();
    const res = await addFind(
      prisma,
      {
        scanId: "s".repeat(24),
        albumId: ALBUM,
        deviceKey: KEY,
        note: "  £3 bin,\nPeckham  ",
      },
      d,
      NOW
    );
    expect(res).toMatchObject({ count: 1, created: true });
    expect(d.confirm).toHaveBeenCalledOnce();
    expect(entries[0]).toMatchObject({
      albumId: ALBUM,
      note: "£3 bin, Peckham",
      deviceKeyHash: hashDeviceKey(KEY),
    });
    expect(entries[0].deviceKeyHash).not.toContain(KEY);
    expect(albums[ALBUM].libraryCount).toBe(1);
  });

  it("accepts a record the user confirmed or picked, without confirming again", async () => {
    const { prisma } = fakePrisma([
      scanRow({ status: "ambiguous", confirmedAlbumId: OTHER }),
    ]);
    const d = deps();
    await addFind(
      prisma,
      { scanId: "s".repeat(24), albumId: OTHER, deviceKey: KEY },
      d,
      NOW
    );
    expect(d.confirm).not.toHaveBeenCalled();
  });

  it("refuses a record the scan didn't identify", async () => {
    for (const scan of [
      scanRow({ topAlbumIds: [OTHER, ALBUM] }), // only the runner-up
      scanRow({ status: "ambiguous" }), // nothing chosen yet
      scanRow({ confirmedAlbumId: OTHER }), // the user said it's another one
    ]) {
      const { prisma } = fakePrisma([scan]);
      await expect(
        addFind(
          prisma,
          { scanId: scan.id, albumId: ALBUM, deviceKey: KEY },
          deps(),
          NOW
        )
      ).rejects.toMatchObject({
        code: "not-identified",
      });
    }
  });

  it("refuses an old scan", async () => {
    const { prisma } = fakePrisma([
      scanRow({ createdAt: new Date(NOW - 31 * 60 * 1000) }),
    ]);
    await expect(
      addFind(
        prisma,
        { scanId: "s".repeat(24), albumId: ALBUM, deviceKey: KEY },
        deps(),
        NOW
      )
    ).rejects.toBeInstanceOf(LibraryError);
  });

  it("adds a scan only once; a second tap returns the same find", async () => {
    const { prisma, entries } = fakePrisma([scanRow()]);
    const first = await addFind(
      prisma,
      { scanId: "s".repeat(24), albumId: ALBUM, deviceKey: KEY },
      deps(),
      NOW
    );
    const again = await addFind(
      prisma,
      { scanId: "s".repeat(24), albumId: ALBUM, deviceKey: KEY },
      deps(),
      NOW
    );
    expect(again).toMatchObject({
      entryId: first.entryId,
      created: false,
      count: 1,
    });
    expect(entries).toHaveLength(1);
  });

  it("keeps only artwork we already hold for the album", async () => {
    const pressing = "https://i.discogs.com/pressing.jpg";
    const { prisma, entries } = fakePrisma(
      [scanRow(), scanRow({ id: "t".repeat(24) })],
      [{ albumId: ALBUM, imageUrl: pressing }]
    );
    await addFind(
      prisma,
      {
        scanId: "s".repeat(24),
        albumId: ALBUM,
        deviceKey: KEY,
        coverUrl: pressing,
      },
      deps(),
      NOW
    );
    await addFind(
      prisma,
      {
        scanId: "t".repeat(24),
        albumId: ALBUM,
        deviceKey: KEY,
        coverUrl: "https://evil.example/x.jpg",
      },
      deps(),
      NOW
    );
    expect(entries.map((e) => e.coverUrl)).toEqual([pressing, null]);
  });

  it("limits how many finds one phone adds an hour", async () => {
    const scans = Array.from({ length: ADDS_PER_HOUR + 1 }, (_, i) =>
      scanRow({ id: String(i).padStart(24, "0") })
    );
    const { prisma } = fakePrisma(scans);
    for (const s of scans.slice(0, ADDS_PER_HOUR)) {
      await addFind(
        prisma,
        { scanId: s.id, albumId: ALBUM, deviceKey: KEY },
        deps(),
        NOW
      );
    }
    await expect(
      addFind(
        prisma,
        { scanId: scans[ADDS_PER_HOUR].id, albumId: ALBUM, deviceKey: KEY },
        deps(),
        NOW
      )
    ).rejects.toMatchObject({ code: "too-many" });
  });
});

describe("findStatus and removeFind", () => {
  it("shows the count, and lets only the adding phone undo", async () => {
    const { prisma, albums } = fakePrisma([scanRow()]);
    const { entryId } = await addFind(
      prisma,
      { scanId: "s".repeat(24), albumId: ALBUM, deviceKey: KEY },
      deps(),
      NOW
    );

    expect(
      await findStatus(prisma, {
        albumId: ALBUM,
        scanId: "s".repeat(24),
        deviceKey: KEY,
      })
    ).toEqual({ count: 1, entryId, added: true });
    expect(
      await findStatus(prisma, {
        albumId: ALBUM,
        scanId: "s".repeat(24),
        deviceKey: "someone-else-aaaaaaaaaaa",
      })
    ).toMatchObject({ entryId: null, added: true });

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
  it("cleans notes to one line of plain text, 140 characters at most", () => {
    expect(cleanNote("   ")).toBeNull();
    expect(cleanNote(null)).toBeNull();
    expect(cleanNote("a‮b\tc")).toBe("a b c");
    expect([...cleanNote("🎶".repeat(200))!]).toHaveLength(140);
  });

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
