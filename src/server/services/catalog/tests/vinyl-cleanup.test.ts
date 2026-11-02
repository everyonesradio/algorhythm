import { describe, expect, it, vi } from "vitest";

import {
  pruneCandidates,
  recordVinylStatus,
  VARIOUS_ARTISTS_MBID,
} from "@/server/services/catalog/vinyl-cleanup";

type Row = Record<string, any>;

const release = (rg: string, format: string) => ({
  id: `${rg}-${format}`,
  title: rg,
  "release-group": { id: rg, title: rg },
  media: [{ format }],
});

const fakePrisma = (albums: Row[], embeddings: Row[] = []) => ({
  album: {
    findMany: vi.fn(async ({ where }: Row) =>
      where?.vinylStatus
        ? albums.filter((a) => a.vinylStatus === where.vinylStatus)
        : albums
    ),
    update: vi.fn(async ({ where, data }: Row) =>
      Object.assign(
        albums.find((a) => a.id === where.id)!,
        data
      )
    ),
  },
  coverEmbedding: {
    findMany: vi.fn(async ({ where }: Row) =>
      embeddings.filter(
        (e) => where.albumId.in.includes(e.albumId) && e.source === where.source
      )
    ),
  },
});

const album = (id: string, artistMbid: string | null, extra: Row = {}): Row => ({
  id,
  mbid: id,
  title: id,
  artist: "Jorja Smith",
  artistName: "Jorja Smith",
  artistMbid,
  ...extra,
});

describe("recordVinylStatus", () => {
  it("browses each artist once and asks Discogs only about albums MusicBrainz shows without vinyl", async () => {
    const albums = [
      album("lostAndFound", "jorja"),
      album("fallingOrFlying", "jorja"),
      album("tape", "jorja"),
    ];
    const prisma = fakePrisma(albums);
    const deps = {
      releasesByArtist: vi.fn(async () => [
        release("fallingOrFlying", '12" Vinyl'),
        release("lostAndFound", "CD"),
        release("tape", "Digital Media"),
      ]),
      releasesByReleaseGroup: vi.fn(async () => []),
      discogsVinyl: vi.fn(async (_a: string, title: string) =>
        title === "lostAndFound" ? 4 : 0
      ),
    };

    await recordVinylStatus(prisma as any, deps);

    expect(deps.releasesByArtist).toHaveBeenCalledOnce();
    expect(deps.discogsVinyl.mock.calls.map((c) => c[1])).toEqual([
      "lostAndFound",
      "tape",
    ]);
    expect(albums.map((a) => [a.id, a.vinylStatus, a.vinylSource])).toEqual([
      ["lostAndFound", "yes", "discogs"],
      ["fallingOrFlying", "yes", "musicbrainz"],
      ["tape", "no", "discogs"],
    ]);
  });

  it("writes nothing on a dry run", async () => {
    const prisma = fakePrisma([album("x", null)]);
    await recordVinylStatus(
      prisma as any,
      {
        releasesByArtist: vi.fn(async () => []),
        releasesByReleaseGroup: vi.fn(async () => [release("x", "Vinyl")]),
        discogsVinyl: vi.fn(async () => 0),
      },
      { dryRun: true }
    );
    expect(prisma.album.update).not.toHaveBeenCalled();
  });

  it("looks up Various Artists by release group, never browses that artist", async () => {
    const albums = [
      album("nigeria70", VARIOUS_ARTISTS_MBID, {
        artist: "Various Artists",
        artistName: "Various Artists",
      }),
    ];
    const prisma = fakePrisma(albums);
    const deps = {
      releasesByArtist: vi.fn(async () => {
        throw new Error("must not browse Various Artists");
      }),
      releasesByReleaseGroup: vi.fn(async () => [
        release("nigeria70", "Vinyl"),
      ]),
      discogsVinyl: vi.fn(async () => 0),
    };

    await recordVinylStatus(prisma as any, deps);

    expect(deps.releasesByArtist).not.toHaveBeenCalled();
    expect(deps.releasesByReleaseGroup).toHaveBeenCalledWith("nigeria70");
    expect(albums[0].vinylStatus).toBe("yes");
  });
});

describe("pruneCandidates", () => {
  it("keeps non-vinyl albums someone confirmed a scan of", async () => {
    const albums = [
      album("mixtape", "k", { vinylStatus: "no" }),
      album("bootlegScanned", "k", { vinylStatus: "no" }),
      album("gkmc", "k", { vinylStatus: "yes" }),
      album("unsure", "k", { vinylStatus: "unknown" }),
    ];
    const prisma = fakePrisma(albums, [
      { albumId: "bootlegScanned", source: "user_scan" },
    ]);
    const { prune, keptScanned } = await pruneCandidates(prisma as any);
    expect(prune.map((a: Row) => a.id)).toEqual(["mixtape"]);
    expect(keptScanned.map((a: Row) => a.id)).toEqual(["bootlegScanned"]);
  });
});
