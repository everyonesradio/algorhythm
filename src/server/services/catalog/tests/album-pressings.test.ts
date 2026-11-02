import { describe, expect, it, vi } from "vitest";

import {
  addPressingsToAlbum,
  DISCOGS_RECHECK_MS,
  NOT_FOUND_RECHECK_MS,
} from "@/server/services/catalog/album-pressings";

const NOW = Date.parse("2026-11-01T12:00:00Z");
type Row = Record<string, any>;

/** In-memory stand-in for the album + coverEmbedding calls. */
const fakePrisma = (album: Row) => {
  const embeddings: Row[] = [
    { albumId: "a1", model: "clip-vit-b32", source: "catalog", vector: [1] },
    { albumId: "a1", model: "clip-vit-b32", source: "user_scan", vector: [2] },
    { albumId: "a1", model: "clip-vit-b32", source: "variant", vector: [3] }, // stale
  ];
  const isDue = (checked: Date | undefined | null, cutoff: Date) =>
    checked == null || checked < cutoff;
  return {
    album,
    embeddings,
    prisma: {
      album: {
        updateMany: async ({ where, data }: Row) => {
          const cutoff = where.OR[2].discogsCheckedAt.lt as Date;
          if (where.id !== album.id || !isDue(album.discogsCheckedAt, cutoff)) {
            return { count: 0 };
          }
          Object.assign(album, data);
          return { count: 1 };
        },
        findUnique: async () => album,
        update: async ({ data }: Row) => Object.assign(album, data),
      },
      coverEmbedding: {
        deleteMany: async ({ where }: Row) => {
          for (let i = embeddings.length - 1; i >= 0; i--) {
            const e = embeddings[i];
            if (e.albumId === where.albumId && e.source === where.source)
              embeddings.splice(i, 1);
          }
        },
        createMany: async ({ data }: Row) => {
          embeddings.push(...data);
        },
      },
    } as any,
  };
};

const embedder = { model: "clip-vit-b32" } as any;
const info = {
  masterId: 8478,
  releaseId: 356592,
  artistId: 25058,
  title: "MM..Food",
  artist: "MF Doom",
  year: 2004,
  genres: ["Hip Hop"],
  styles: ["Boom Bap"],
  labels: ["Rhymesayers Entertainment"],
  coverUrl: "https://i.discogs.com/x.jpg",
};
const found = {
  info,
  variants: [
    {
      source: "variant" as const,
      vector: [4],
      imageUrl: "https://i/1",
      releaseId: 356592,
      note: "2004",
    },
    {
      source: "variant" as const,
      vector: [5],
      imageUrl: "https://i/2",
      releaseId: 32373327,
      note: "2024",
    },
  ],
};

describe("addPressingsToAlbum", () => {
  it("adds the album's pressings, replacing stale ones and keeping other vectors", async () => {
    const { prisma, album, embeddings } = fakePrisma({
      id: "a1",
      title: "MM..FOOD",
      artist: "MF DOOM",
      artistName: "MF DOOM",
    });
    const discogsAlbum = vi.fn(async () => found);

    const res = await addPressingsToAlbum(
      prisma,
      embedder,
      "a1",
      { discogsAlbum },
      NOW
    );

    expect(res).toEqual({ status: "added", variants: 2 });
    expect(discogsAlbum).toHaveBeenCalledWith(embedder, "MF DOOM", "MM..FOOD", {
      variants: true,
    });
    expect(embeddings.map((e) => e.source).sort()).toEqual([
      "catalog",
      "user_scan",
      "variant",
      "variant",
    ]);
    expect(
      embeddings
        .filter((e) => e.source === "variant")
        .map((e) => e.discogsReleaseId)
    ).toEqual([356592, 32373327]);
    expect(album).toMatchObject({
      labels: ["Rhymesayers Entertainment"],
      styles: ["Boom Bap"],
      discogsMasterId: 8478,
    });
  });

  it("skips an album checked within the last 30 days", async () => {
    const { prisma } = fakePrisma({
      id: "a1",
      title: "x",
      artist: "y",
      discogsCheckedAt: new Date(NOW - 1000),
    });
    const discogsAlbum = vi.fn(async () => found);
    expect(
      await addPressingsToAlbum(prisma, embedder, "a1", { discogsAlbum }, NOW)
    ).toEqual({ status: "skipped" });
    expect(discogsAlbum).not.toHaveBeenCalled();
  });

  it("re-checks after 30 days", async () => {
    const { prisma } = fakePrisma({
      id: "a1",
      title: "x",
      artist: "y",
      discogsCheckedAt: new Date(NOW - DISCOGS_RECHECK_MS - 1),
    });
    const discogsAlbum = vi.fn(async () => found);
    expect(
      (await addPressingsToAlbum(prisma, embedder, "a1", { discogsAlbum }, NOW))
        .status
    ).toBe("added");
  });

  it("remembers albums Discogs doesn't know for a week, not a month", async () => {
    const { prisma } = fakePrisma({ id: "a1", title: "x", artist: "y" });
    const discogsAlbum = vi.fn(async () => null);
    expect(
      await addPressingsToAlbum(prisma, embedder, "a1", { discogsAlbum }, NOW)
    ).toEqual({ status: "not-found" });
    // Not on every scan...
    expect(
      await addPressingsToAlbum(
        prisma,
        embedder,
        "a1",
        { discogsAlbum },
        NOW + 1000
      )
    ).toEqual({ status: "skipped" });
    // ...but retried after a week.
    const later = NOW + NOT_FOUND_RECHECK_MS + 1000;
    expect(
      (
        await addPressingsToAlbum(
          prisma,
          embedder,
          "a1",
          { discogsAlbum },
          later
        )
      ).status
    ).toBe("not-found");
    expect(discogsAlbum).toHaveBeenCalledTimes(2);
  });

  it("skips albums known not to be on vinyl", async () => {
    const { prisma } = fakePrisma({
      id: "a1",
      title: "x",
      artist: "y",
      vinylStatus: "no",
    });
    const discogsAlbum = vi.fn(async () => found);
    expect(
      await addPressingsToAlbum(prisma, embedder, "a1", { discogsAlbum }, NOW)
    ).toEqual({
      status: "not-vinyl",
    });
    expect(discogsAlbum).not.toHaveBeenCalled();
  });

  it("lets only one of two simultaneous scans fetch pressings", async () => {
    const { prisma } = fakePrisma({ id: "a1", title: "x", artist: "y" });
    const discogsAlbum = vi.fn(async () => found);
    const results = await Promise.all([
      addPressingsToAlbum(prisma, embedder, "a1", { discogsAlbum }, NOW),
      addPressingsToAlbum(prisma, embedder, "a1", { discogsAlbum }, NOW),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["added", "skipped"]);
    expect(discogsAlbum).toHaveBeenCalledTimes(1);
  });
});
