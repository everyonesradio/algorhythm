import { describe, expect, it } from "vitest";

import {
  ADDS_PER_HOUR,
  addFind,
  albumFinds,
  listLibrary,
  REPORTS_TO_HIDE,
  reportFind,
  cleanNote,
  hashDeviceKey,
  LibraryError,
  removeFind,
  setNote,
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
            hidden: false,
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
    const res = await add(prisma, { note: "  £3 bin,\nPeckham  " });
    expect(res).toMatchObject({ count: 1, created: true });
    expect(entries[0]).toMatchObject({
      albumId: ALBUM,
      note: "£3 bin, Peckham",
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
    const first = await add(prisma, { note: "first" });
    const rescan = await add(prisma, { scanId: "t".repeat(24) });
    expect(rescan).toMatchObject({
      entryId: first.entryId,
      note: "first",
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

describe("removeFind and setNote", () => {
  it("lets only the adding phone remove a find or change its note", async () => {
    const { prisma, albums, entries } = fakePrisma([scanRow()]);
    const { entryId } = await add(prisma);
    const stranger = "someone-else-aaaaaaaaaaa";

    await expect(
      setNote(prisma, { entryId, deviceKey: stranger, note: "hi" })
    ).rejects.toMatchObject({ code: "not-yours" });
    expect(
      await setNote(prisma, { entryId, deviceKey: KEY, note: " found it\n" })
    ).toEqual({ note: "found it" });
    expect(entries[0].note).toBe("found it");

    await expect(
      removeFind(prisma, { entryId, deviceKey: stranger })
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

/** Fake with update/findMany/findFirst for list, finds and reports. */
const richPrisma = () => {
  const { prisma, entries, albums } = fakePrisma([]);
  const visible = (where: Row) =>
    entries.filter((e) =>
      Object.entries(where).every(([k, v]) =>
        v && typeof v === "object" && "in" in v
          ? v.in.includes(e[k])
          : e[k] === v
      )
    );
  prisma.libraryEntry.findMany = async ({ where, take }: Row) =>
    visible(where)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, take ?? 1000);
  prisma.libraryEntry.findFirst = async ({ where }: Row) =>
    visible(where).sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
  prisma.libraryEntry.update = async ({ where, data }: Row) =>
    Object.assign(
      entries.find((e) => e.id === where.id)!,
      data
    );
  prisma.album.findMany = async ({ take }: Row) =>
    Object.values(albums)
      .filter((a: any) => (a.libraryCount ?? 0) > 0)
      .sort((a: any, b: any) => b.libraryLastAt - a.libraryLastAt)
      .slice(0, take);
  return { prisma, entries, albums };
};

const seed = (
  entries: Row[],
  albumId: string,
  note: string | null,
  ago: number,
  key = KEY
) =>
  entries.push({
    id: `x${entries.length}`,
    albumId,
    note,
    deviceKeyHash: hashDeviceKey(key),
    hidden: false,
    reporters: [],
    createdAt: new Date(NOW - ago),
  });

describe("reportFind", () => {
  it("hides a find after reports from three different phones, and recounts", async () => {
    const { prisma, entries, albums } = richPrisma();
    seed(entries, ALBUM, "bad note", 1000);
    albums[ALBUM].libraryCount = 1;
    for (let i = 0; i < REPORTS_TO_HIDE - 1; i++) {
      expect(
        await reportFind(prisma, {
          entryId: "x0",
          deviceKey: `reporter-${i}-aaaaaaaaaaaaaa`,
        })
      ).toEqual({ hidden: false });
    }
    // The same phone again doesn't count twice.
    await reportFind(prisma, {
      entryId: "x0",
      deviceKey: "reporter-0-aaaaaaaaaaaaaa",
    });
    expect(entries[0].hidden).toBe(false);
    expect(
      await reportFind(prisma, {
        entryId: "x0",
        deviceKey: "reporter-x-aaaaaaaaaaaaaa",
      })
    ).toEqual({ hidden: true });
    expect(albums[ALBUM].libraryCount).toBe(0);
  });

  it("won't let you report your own find", async () => {
    const { prisma, entries } = richPrisma();
    seed(entries, ALBUM, "mine", 1000);
    await expect(
      reportFind(prisma, { entryId: "x0", deviceKey: KEY })
    ).rejects.toMatchObject({ code: "not-yours" });
  });
});

describe("listing", () => {
  it("lists albums with finds, latest note first, and only visible notes", async () => {
    const { prisma, entries, albums } = richPrisma();
    seed(entries, ALBUM, "older note", 5000);
    seed(entries, ALBUM, "newest note", 1000);
    seed(entries, OTHER, "hidden note", 500);
    entries[2].hidden = true;
    Object.assign(albums[ALBUM], {
      libraryCount: 2,
      libraryLastAt: new Date(NOW - 1000),
    });

    const page = await listLibrary(
      prisma,
      { sort: "recent", offset: 0, limit: 24 },
      { id: true }
    );
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      count: 2,
      latestNote: "newest note",
    });
    expect(page.nextOffset).toBeNull();

    const finds = await albumFinds(prisma, { albumId: ALBUM, deviceKey: KEY });
    expect(finds.finds.map((f) => [f.note, f.mine])).toEqual([
      ["newest note", true],
      ["older note", true],
    ]);
  });
});
