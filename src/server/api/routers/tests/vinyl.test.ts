import { beforeEach, describe, expect, it } from "vitest";

import { l2Normalize } from "@/lib/embeddings/vector";
import { vinylRouter } from "@/server/api/routers/vinyl";
import { createCallerFactory } from "@/server/api/trpc";

/**
 * Exercises identify -> confirm against an in-memory stand-in for the Prisma
 * calls the router makes, using the brute-force ("local") search mode.
 */
process.env.VECTOR_SEARCH_MODE = "local";

const DIMS = 512;
const oid = (n: number) => n.toString(16).padStart(24, "0");
/** Unit vector pointing mostly along axis `i`, with a little `noise`. */
const vec = (i: number, noise = 0, j = (i + 1) % DIMS) => {
  const v = new Array<number>(DIMS).fill(0);
  v[i] = 1;
  v[j] = noise;
  return l2Normalize(v);
};

type Row = Record<string, any>;

const makeFakePrisma = () => {
  const albums: Row[] = [
    { id: oid(1), title: "Voodoo", artist: "D'Angelo", genres: [], tags: [], labels: [], coverUrl: "a.jpg", releaseYear: 2000 },
    { id: oid(2), title: "Baduizm", artist: "Erykah Badu", genres: [], tags: [], labels: [], coverUrl: "b.jpg", releaseYear: 1997 },
  ];
  const embeddings: Row[] = [
    { albumId: oid(1), model: "clip-vit-b32", vector: vec(0), source: "catalog" },
    { albumId: oid(1), model: "clip-vit-b32", vector: vec(0, 0.2), source: "spotify" },
    { albumId: oid(2), model: "clip-vit-b32", vector: vec(5), source: "catalog" },
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
    },
    scanEvent: {
      create: async ({ data }: Row) => {
        const row = { id: oid(100 + scans.length), confirmedAlbumId: null, ...data };
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
    prisma = makeFakePrisma();
    caller = createCaller({ prisma } as never);
  });

  it("identifies the closest album and logs the scan", async () => {
    const res = await caller.identify({ model: "clip-vit-b32", vectors: [vec(0, 0.1)] });
    expect(res.status).toBe("matched");
    expect(res.matches[0].album.title).toBe("Voodoo");
    expect(res.matches).toHaveLength(1); // Baduizm is far below the candidate bar
    expect(res.scanId).toBeTruthy();
    expect(prisma.scans).toHaveLength(1);
  });

  it("returns none (and logs nothing) for an unknown cover", async () => {
    const res = await caller.identify({ model: "clip-vit-b32", vectors: [vec(300)] });
    expect(res).toEqual({ status: "none", scanId: null, matches: [] });
    expect(prisma.scans).toHaveLength(0);
  });

  it("searches every crop and keeps the one that matched", async () => {
    // First crop sees nothing useful (record held far away), second matches.
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

  it("stores the confirmed scan as a new user_scan embedding, once", async () => {
    const { scanId } = await caller.identify({ model: "clip-vit-b32", vectors: [vec(0, 0.1)] });
    const first = await caller.confirm({ scanId: scanId!, albumId: oid(1) });
    expect(first.stored).toBe(true);
    expect(prisma.embeddings.filter((e) => e.source === "user_scan")).toHaveLength(1);

    const again = await caller.confirm({ scanId: scanId!, albumId: oid(1) });
    expect(again).toEqual({ stored: false, reason: "already-confirmed" });
  });

  it("refuses to attach a scan to an album that wasn't a candidate", async () => {
    const { scanId } = await caller.identify({ model: "clip-vit-b32", vectors: [vec(0, 0.1)] });
    await expect(caller.confirm({ scanId: scanId!, albumId: oid(2) })).rejects.toThrow(
      /not a candidate/
    );
  });
});
