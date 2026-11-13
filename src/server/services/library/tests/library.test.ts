import { describe, expect, it, vi } from "vitest";

import {
  ADDS_PER_HOUR,
  addFind,
  albumFinds,
  listLibrary,
  REPORTS_TO_HIDE,
  reportFind,
  cleanNote,
  findStatus,
  hashDeviceKey,
  LibraryError,
  namedBy,
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
    coverUrl: null,
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

describe("namedBy", () => {
  it("tells the app's names from suggestions and records the room taught it", () => {
    const s = scanRow();
    expect(namedBy(s as any, ALBUM)).toBe("app");
    expect(namedBy(s as any, OTHER)).toBe("suggestions");
    expect(namedBy(scanRow({ status: "ambiguous" }) as any, ALBUM)).toBe(
      "suggestions"
    );
    expect(namedBy(s as any, "c".repeat(24))).toBe("hand");
    expect(
      namedBy(scanRow({ status: "no_match", topAlbumIds: [] }) as any, ALBUM)
    ).toBe("hand");
  });
});

describe("addFind at a pop-up", () => {
  const input = {
    scanId: "s".repeat(24),
    albumId: ALBUM,
    deviceKey: KEY,
    event: { slug: "stump-bristol", code: "K7Q2XM" },
  };

  it("credits the find to the event, with how it was named", async () => {
    const { prisma, entries } = fakePrisma([scanRow()]);
    const checkEvent = vi.fn(async (e: { slug: string }) => ({ slug: e.slug }));
    const res = await addFind(prisma, input, { ...deps(), checkEvent }, NOW);
    expect(res).toMatchObject({
      created: true,
      event: "stump-bristol",
      eventProblem: null,
    });
    expect(entries[0]).toMatchObject({
      event: "stump-bristol",
      namedBy: "app",
    });
  });

  it("still adds the find when the code is wrong or the night is over", async () => {
    const { prisma, entries } = fakePrisma([scanRow()]);
    const checkEvent = vi.fn(async () => {
      throw new Error("This pop-up has finished.");
    });
    const res = await addFind(prisma, input, { ...deps(), checkEvent }, NOW);
    expect(res).toMatchObject({
      created: true,
      event: null,
      eventProblem: "This pop-up has finished.",
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].event ?? null).toBeNull();
  });

  it("records namedBy without an event too", async () => {
    const { prisma, entries } = fakePrisma([
      scanRow({ status: "ambiguous", confirmedAlbumId: OTHER }),
    ]);
    await addFind(
      prisma,
      { ...input, albumId: OTHER, event: undefined },
      deps(),
      NOW
    );
    expect(entries[0]).toMatchObject({ namedBy: "suggestions" });
  });
});
