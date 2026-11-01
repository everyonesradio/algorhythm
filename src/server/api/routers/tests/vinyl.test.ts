import { beforeEach, describe, expect, it, vi } from "vitest";

import { l2Normalize } from "@/lib/embeddings/vector";

/**
 * Exercises identify -> confirm / pick against an in-memory stand-in for the
 * Prisma calls the router makes, using the brute-force ("local") search mode.
 * The background catalog ingest and MusicBrainz are mocked: we assert that
 * ingest is *requested*, not that it runs.
 */
process.env.VECTOR_SEARCH_MODE = "local";

vi.mock("@/server/services/catalog/background", () => ({
  startArtistIngest: vi.fn(),
}));
vi.mock("@/server/services/catalog/musicbrainz", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/services/catalog/musicbrainz")>()),
  lookupReleaseGroup: vi.fn(async (mbid: string) => ({
    id: mbid,
    title: mbid === GNX ? "GNX" : "Some Other Record",
    "primary-type": "Album",
    "first-release-date": "2024-11-22",
    "artist-credit": [
      mbid === GNX
        ? { name: "Kendrick Lamar", artist: { id: KDOT, name: "Kendrick Lamar" } }
        : { name: "Someone Else", artist: { id: "someone-else", name: "Someone Else" } },
    ],
    genres: [{ name: "west coast hip hop", count: 3 }],
    tags: [],
  })),
  coverExists: vi.fn(async () => true),
}));

const { startArtistIngest } = await import("@/server/services/catalog/background");
const { vinylRouter } = await import("@/server/api/routers/vinyl");
const { createCallerFactory } = await import("@/server/api/trpc");

const KDOT = "381086ea-f511-4aba-bdf9-71c753dc5077";
const GNX = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-2222-3333-4444-555555555555";

const DIMS = 512;
const oid = (n: number) => n.toString(16).padStart(24, "0");
/** Unit vector pointing mostly along axis `i`, with a little `noise`. */
const vec = (i: number, noise = 0, j = (i + 1) % DIMS) => {
  const v = new Array<number>(DIMS).fill(0);
  v[i] = 1;
  v[j] = noise;
  return l2Normalize(v);
};
/** Kendrick covers share a "style" axis (12) plus their own axis. */
const kendrickCover = (own: number) => {
  const v = new Array<number>(DIMS).fill(0);
  v[12] = 1;
  v[own] = 0.8;
  return l2Normalize(v);
};

type Row = Record<string, any>;

const makeFakePrisma = () => {
  const albums: Row[] = [
    { id: oid(1), title: "Voodoo", artist: "D'Angelo", artistMbid: "dangelo", genres: [], tags: [], labels: [], coverUrl: "a.jpg", releaseYear: 2000 },
    { id: oid(2), title: "Baduizm", artist: "Erykah Badu", artistMbid: "badu", genres: [], tags: [], labels: [], coverUrl: "b.jpg", releaseYear: 1997 },
    { id: oid(3), title: "good kid, m.A.A.d city", artist: "Kendrick Lamar", artistMbid: KDOT, genres: [], tags: [], labels: [], coverUrl: "c.jpg", releaseYear: 2012 },
    { id: oid(4), title: "To Pimp a Butterfly", artist: "Kendrick Lamar", artistMbid: KDOT, genres: [], tags: [], labels: [], coverUrl: "d.jpg", releaseYear: 2015 },
  ];
  const embeddings: Row[] = [
    { albumId: oid(1), model: "clip-vit-b32", vector: vec(0), source: "catalog" },
    { albumId: oid(1), model: "clip-vit-b32", vector: vec(0, 0.2), source: "spotify" },
    { albumId: oid(2), model: "clip-vit-b32", vector: vec(5), source: "catalog" },
    { albumId: oid(3), model: "clip-vit-b32", vector: kendrickCover(10), source: "catalog" },
    { albumId: oid(4), model: "clip-vit-b32", vector: kendrickCover(11), source: "catalog" },
  ];
  const scans: Row[] = [];

  return {
    albums,
    embeddings,
    scans,
    coverEmbedding: {
      findMany: async ({ where }: Row) => embeddings.filter((e) => e.model === where.model),
      count: async ({ where }: Row) =>
        embeddings.filter(
          (e) => e.albumId === where.albumId && e.model === where.model && e.source === where.source
        ).length,
      create: async ({ data }: Row) => {
        embeddings.push(data);
        return data;
      },
    },
    album: {
      findMany: async ({ where }: Row) => albums.filter((a) => where.id.in.includes(a.id)),
      findUnique: async ({ where }: Row) =>
        albums.find((a) => (where.id ? a.id === where.id : a.sourceKey === where.sourceKey)) ??
        null,
      create: async ({ data }: Row) => {
        const row = { id: oid(200 + albums.length), ...data };
        albums.push(row);
        return row;
      },
    },
    scanEvent: {
      create: async ({ data }: Row) => {
        const row = {
          id: oid(100 + scans.length),
          confirmedAlbumId: null,
          createdAt: new Date(),
          ...data,
        };
        scans.push(row);
        return { id: row.id };
      },
      findUnique: async ({ where }: Row) => scans.find((s) => s.id === where.id) ?? null,
      update: async ({ where, data }: Row) => Object.assign(scans.find((s) => s.id === where.id)!, data),
    },
  };
};

describe("vinyl router", () => {
  const createCaller = createCallerFactory(vinylRouter);
  let prisma: ReturnType<typeof makeFakePrisma>;
  let caller: ReturnType<typeof createCaller>;

  beforeEach(() => {
    vi.mocked(startArtistIngest).mockClear();
    prisma = makeFakePrisma();
    caller = createCaller({ prisma } as never);
  });

  it("identifies the closest album, logs the scan and requests the artist's catalog", async () => {
    const res = await caller.identify({ model: "clip-vit-b32", vectors: [vec(0, 0.1)] });
    expect(res.status).toBe("matched");
    expect(res.matches[0].album.title).toBe("Voodoo");
    expect(res.matches).toHaveLength(1); // Baduizm is far below the candidate bar
    expect(res.artistSuggestions).toEqual([]);
    expect(res.scanId).toBeTruthy();
    expect(prisma.scans).toHaveLength(1);
    expect(startArtistIngest).toHaveBeenCalledWith(
      expect.anything(),
      { mbid: "dangelo", name: "D'Angelo" },
      "scan_match"
    );
  });

  it("returns none (and logs nothing) for an unknown cover", async () => {
    const res = await caller.identify({ model: "clip-vit-b32", vectors: [vec(300)] });
    expect(res).toEqual({ status: "none", scanId: null, matches: [], artistSuggestions: [] });
    expect(prisma.scans).toHaveLength(0);
    expect(startArtistIngest).not.toHaveBeenCalled();
  });

  it("keeps an unmatched scan when asked, so the record can be picked by hand", async () => {
    const res = await caller.identify({ model: "clip-vit-b32", vectors: [vec(300)], log: true });
    expect(res.status).toBe("none");
    expect(res.scanId).toBeTruthy();
    expect(prisma.scans).toHaveLength(1);
  });

  it("searches every crop and keeps the one that matched", async () => {
    const res = await caller.identify({
      model: "clip-vit-b32",
      vectors: [vec(300), vec(0, 0.1)],
    });
    expect(res.status).toBe("matched");
    expect(res.matches[0].album.title).toBe("Voodoo");
  });

  it("rejects vectors of the wrong size", async () => {
    await expect(
      caller.identify({ model: "clip-vit-b32", vectors: [[1, 2, 3]] })
    ).rejects.toThrow(/Vector size/);
  });

  it("stores the confirmed scan as a new user_scan embedding, once, and requests the catalog", async () => {
    const { scanId } = await caller.identify({ model: "clip-vit-b32", vectors: [vec(0, 0.1)] });
    vi.mocked(startArtistIngest).mockClear();
    const first = await caller.confirm({ scanId: scanId!, albumId: oid(1) });
    expect(first.stored).toBe(true);
    expect(prisma.embeddings.filter((e) => e.source === "user_scan")).toHaveLength(1);
    expect(startArtistIngest).toHaveBeenCalledWith(
      expect.anything(),
      { mbid: "dangelo", name: "D'Angelo" },
      "scan_confirm"
    );

    const again = await caller.confirm({ scanId: scanId!, albumId: oid(1) });
    expect(again).toEqual({ stored: false, reason: "already-confirmed" });
  });

  it("refuses to attach a scan to an album that wasn't a candidate", async () => {
    const { scanId } = await caller.identify({ model: "clip-vit-b32", vectors: [vec(0, 0.1)] });
    await expect(caller.confirm({ scanId: scanId!, albumId: oid(2) })).rejects.toThrow(
      /not a candidate/
    );
  });

  describe("unknown album by a known artist (the GNX case)", () => {
    // A new Kendrick cover: shares the Kendrick "style" but is neither album.
    const gnxScan = () => vec(12);

    it("suggests the artists of the nearest covers", async () => {
      const res = await caller.identify({ model: "clip-vit-b32", vectors: [gnxScan()] });
      expect(res.status).not.toBe("matched");
      expect(res.artistSuggestions).toContainEqual({ name: "Kendrick Lamar", mbid: KDOT });
      expect(res.scanId).toBeTruthy();
      expect(prisma.scans[0].artistSuggestionMbids).toContain(KDOT);
      expect(startArtistIngest).not.toHaveBeenCalled();
    });

    it("picking the record adds it w/ the scan as its first vector and starts the catalog ingest", async () => {
      const { scanId } = await caller.identify({ model: "clip-vit-b32", vectors: [gnxScan()] });
      const { album } = await caller.pick({ scanId: scanId!, mbid: GNX });

      expect(album).toMatchObject({ title: "GNX", artist: "Kendrick Lamar", artistMbid: KDOT });
      const added = prisma.albums.find((a) => a.sourceKey === `mb:${GNX}`)!;
      expect(added.coverUrl).toBe(`https://coverartarchive.org/release-group/${GNX}/front-500`);
      const vectors = prisma.embeddings.filter((e) => e.albumId === added.id);
      expect(vectors).toHaveLength(1);
      expect(vectors[0].source).toBe("user_scan");
      expect(prisma.scans[0].confirmedAlbumId).toBe(added.id);
      expect(startArtistIngest).toHaveBeenCalledWith(
        expect.anything(),
        { mbid: KDOT, name: "Kendrick Lamar" },
        "scan_pick"
      );

      // Next time the same cover is scanned, it matches the new album.
      const again = await caller.identify({ model: "clip-vit-b32", vectors: [gnxScan()] });
      expect(again.matches[0].album.title).toBe("GNX");
    });

    it("lets the user pick a record by an artist found through search", async () => {
      const { scanId } = await caller.identify({
        model: "clip-vit-b32",
        vectors: [vec(300)],
        log: true,
      });
      const { album } = await caller.pick({ scanId: scanId!, mbid: OTHER });
      expect(album.artist).toBe("Someone Else");
    });

    it("refuses an expired scan", async () => {
      const { scanId } = await caller.identify({ model: "clip-vit-b32", vectors: [gnxScan()] });
      prisma.scans[0].createdAt = new Date(Date.now() - 31 * 60 * 1000);
      await expect(caller.pick({ scanId: scanId!, mbid: GNX })).rejects.toThrow(/expired/);
    });

    it("returns the same album if a scan is picked twice", async () => {
      const { scanId } = await caller.identify({ model: "clip-vit-b32", vectors: [gnxScan()] });
      const first = await caller.pick({ scanId: scanId!, mbid: GNX });
      const second = await caller.pick({ scanId: scanId!, mbid: OTHER });
      expect(second.album.id).toBe(first.album.id);
      expect(prisma.embeddings.filter((e) => e.source === "user_scan")).toHaveLength(1);
    });
  });
});
