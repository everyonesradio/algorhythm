import { describe, expect, it, vi } from "vitest";

import {
  concise,
  DETAILS_TTL_MS,
  type DetailsDeps,
  getAlbumDetails,
  PARTIAL_TTL_MS,
  pickRelease,
  tracklistFromRelease,
} from "@/server/services/library/album-details";

const NOW = Date.parse("2026-11-13T12:00:00Z");

describe("concise", () => {
  it("keeps the first one or two sentences within the limit", () => {
    const text =
      "Blonde is the second studio album by the American singer Frank Ocean. It was released on August 20, 2016. It features guest vocals from André 3000.";
    expect(concise(text)).toBe(
      "Blonde is the second studio album by the American singer Frank Ocean. It was released on August 20, 2016."
    );
    expect(concise(text, 80)).toBe(
      "Blonde is the second studio album by the American singer Frank Ocean."
    );
  });

  it("doesn't split on abbreviations or numbered volumes", () => {
    expect(concise("Released in the U.S. on vinyl. Vol. 2 followed.")).toBe(
      "Released in the U.S. on vinyl. Vol. 2 followed."
    );
  });

  it("cuts one very long sentence at a word, with an ellipsis", () => {
    const out = concise("word ".repeat(100));
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(240);
  });
});

const release = (over: Record<string, unknown> = {}) => ({
  id: "r",
  title: "SOS",
  date: "2022-12-09",
  status: "Official",
  media: [
    {
      format: "Digital Media",
      position: 1,
      tracks: [{ number: "1", title: "SOS", length: 117000 }],
    },
  ],
  ...over,
});

describe("tracklist", () => {
  it("prefers an official vinyl release with the album's title", () => {
    const vinyl = release({
      id: "v",
      date: "2023-01-01",
      media: [
        {
          format: '12" Vinyl',
          position: 1,
          tracks: [{ number: "A1", title: "SOS", length: 117000 }],
        },
      ],
    });
    expect(
      pickRelease(
        [release(), vinyl, release({ id: "deluxe", title: "SOS Deluxe" })],
        "SOS"
      )?.id
    ).toBe("v");
  });

  it("marks sides only when the release numbers tracks that way", () => {
    expect(
      tracklistFromRelease(
        release({
          media: [
            {
              format: "Vinyl",
              position: 1,
              tracks: [
                { number: "A1", title: "x" },
                { number: "B1", title: "y" },
              ],
            },
          ],
        })
      )
    ).toMatchObject({
      sides: true,
      tracks: [{ position: "A1" }, { position: "B1" }],
    });
    expect(tracklistFromRelease(release())).toMatchObject({
      sides: false,
      tracks: [{ position: "1", length: "1:57" }],
    });
  });

  it("prefixes the disc on multi-disc releases numbered per disc", () => {
    const t = tracklistFromRelease(
      release({
        media: [
          { format: "CD", position: 1, tracks: [{ number: "1", title: "a" }] },
          { format: "CD", position: 2, tracks: [{ number: "1", title: "b" }] },
        ],
      })
    );
    expect(t?.tracks.map((x) => x.position)).toEqual(["1-1", "2-1"]);
  });

  it("skips releases without tracks", () => {
    expect(
      pickRelease(
        [release({ media: [{ format: "Vinyl", tracks: [] }] })],
        "SOS"
      )
    ).toBeNull();
  });
});

const fakePrisma = (album: Record<string, any>) => ({
  album,
  prisma: {
    album: {
      findUnique: vi.fn(async () => album),
      update: vi.fn(async ({ data }: any) => Object.assign(album, data)),
    },
  } as any,
});

const deps = (over: Partial<DetailsDeps> = {}): DetailsDeps => ({
  releasesWithTracks: vi.fn(async () => [release()]),
  releaseGroupLinks: vi.fn(async () => ({
    wikidata: "Q1",
    reviews: [
      "https://pitchfork.com/reviews/albums/sos",
      "https://www.bbc.co.uk/music/reviews/a",
      "https://www.bbc.co.uk/music/reviews/b",
    ],
  })),
  artistWikidata: vi.fn(async () => "Q2"),
  wikidata: vi.fn(async (qid: string) => ({
    wikipedia: {
      extract: `About ${qid}. More text here. And more.`,
      url: `https://en.wikipedia.org/wiki/${qid}`,
    },
    links:
      qid === "Q1"
        ? [{ name: "AllMusic", url: "https://www.allmusic.com/album/x" }]
        : [],
    scores: [],
  })),
  spotifyTracks: vi.fn(async () => null),
  ...over,
});

describe("getAlbumDetails", () => {
  const base = {
    mbid: "rg",
    title: "SOS",
    artistMbid: "art",
    spotifyId: null,
    extra: { keep: 1 },
  };

  it("collects tracklist, short about text and one link per review site, and caches it", async () => {
    const { prisma, album } = fakePrisma({ ...base });
    const d = deps();
    const out = await getAlbumDetails(prisma, "a", d, NOW);
    expect(out?.tracklist?.tracks).toHaveLength(1);
    expect(out?.about.album).toEqual({
      text: "About Q1. More text here.",
      url: "https://en.wikipedia.org/wiki/Q1",
    });
    expect(out?.more.links.map((l) => l.name)).toEqual([
      "AllMusic",
      "Pitchfork",
      "BBC Music",
    ]);
    expect(album.extra.keep).toBe(1); // other extra fields survive

    await getAlbumDetails(prisma, "a", d, NOW + 1000);
    expect(d.releasesWithTracks).toHaveBeenCalledTimes(1);
    await getAlbumDetails(prisma, "a", d, NOW + DETAILS_TTL_MS + 1);
    expect(d.releasesWithTracks).toHaveBeenCalledTimes(2);
  });

  it("falls back to Spotify's tracklist when MusicBrainz has none", async () => {
    const { prisma } = fakePrisma({ ...base, spotifyId: "sp" });
    const out = await getAlbumDetails(
      prisma,
      "a",
      deps({
        releasesWithTracks: vi.fn(async () => []),
        spotifyTracks: vi.fn(async () => [
          {
            name: "Kill Bill",
            track_number: 3,
            disc_number: 1,
            duration_ms: 153000,
          },
        ]),
      }),
      NOW
    );
    expect(out?.tracklist).toMatchObject({
      source: "spotify",
      tracks: [{ position: "3", title: "Kill Bill", length: "2:33" }],
    });
  });

  it("refreshes after a day, not a month, when a source failed", async () => {
    const { prisma } = fakePrisma({ ...base });
    const d = deps({
      artistWikidata: vi.fn(async () => {
        throw new Error("MusicBrainz 503");
      }),
    });
    const out = await getAlbumDetails(prisma, "a", d, NOW);
    expect(out?.partial).toBe(true);
    await getAlbumDetails(prisma, "a", d, NOW + PARTIAL_TTL_MS + 1);
    expect(d.releasesWithTracks).toHaveBeenCalledTimes(2);
  });

  it("treats Wikipedia being rate-limited as partial too", async () => {
    const { prisma } = fakePrisma({ ...base });
    const out = await getAlbumDetails(
      prisma,
      "a",
      deps({
        wikidata: vi.fn(async () => ({
          wikipedia: null,
          transient: true,
          links: [],
          scores: [],
        })),
      }),
      NOW
    );
    expect(out).toMatchObject({
      partial: true,
      about: { album: null, artist: null },
    });
  });

  it("works for albums MusicBrainz doesn't know", async () => {
    const { prisma } = fakePrisma({ ...base, mbid: null, artistMbid: null });
    const d = deps();
    const out = await getAlbumDetails(prisma, "a", d, NOW);
    expect(out).toMatchObject({
      tracklist: null,
      about: { album: null, artist: null },
      more: { links: [] },
    });
    expect(d.releasesWithTracks).not.toHaveBeenCalled();
  });
});
