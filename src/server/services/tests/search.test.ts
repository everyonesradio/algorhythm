// ** Third-Party Imports
import { beforeEach, describe, expect, it, vi } from "vitest";

// ** Custom Components, Hooks, Utils, etc.
import { Adapter, MetadataType, Parser } from "@/config/enum";
import { getSearchParser } from "@/parsers/link";

/**
 * Unit tests for the cross-platform link search. Every network call
 * (metadata scraping, platform searches, URL shortener) is mocked so the
 * suite is deterministic and runs offline.
 *
 * A live smoke test against the real services runs only with
 * RUN_LIVE_TESTS=1 (and real credentials in the environment).
 */

const spotifyUrl = "https://open.spotify.com/album/4HgkXIyPXtXueFq7swBqXa";

const albumMetadata = {
  id: "4HgkXIyPXtXueFq7swBqXa",
  title: "The Angel You Don't Know",
  description: "Amaarae · Album · 2020 · 14 songs",
  type: MetadataType.Album,
  image: "https://i.scdn.co/image/abc",
};

const link = (type: Adapter, url: string, isVerified = true) => ({
  type,
  url,
  isVerified,
});

vi.mock("@/parsers/spotify", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/parsers/spotify")>()),
  getSpotifyMetadata: vi.fn(async () => albumMetadata),
}));
vi.mock("@/adapters/youtube", () => ({ getYouTubeLink: vi.fn() }));
vi.mock("@/adapters/apple-music", () => ({ getAppleMusicLink: vi.fn() }));
vi.mock("@/adapters/deezer", () => ({ getDeezerLink: vi.fn() }));
vi.mock("@/adapters/sound-cloud", () => ({ getSoundCloudLink: vi.fn() }));
vi.mock("@/adapters/spotify", () => ({ getSpotifyLink: vi.fn() }));
vi.mock("@/utils/url-shortener", () => ({
  shortenLink: vi.fn(async (url: string) => url),
}));

const { getYouTubeLink } = await import("@/adapters/youtube");
const { getAppleMusicLink } = await import("@/adapters/apple-music");
const { getDeezerLink } = await import("@/adapters/deezer");
const { getSoundCloudLink } = await import("@/adapters/sound-cloud");
const { getSpotifyLink } = await import("@/adapters/spotify");
const { search } = await import("@/server/services/search");

const ALL_BUT_SPOTIFY = [
  Adapter.YouTube,
  Adapter.AppleMusic,
  Adapter.Deezer,
  Adapter.SoundCloud,
  Adapter.Tidal,
];

describe("getSearchParser", () => {
  it("extracts the Spotify album id", () => {
    const parser = getSearchParser(spotifyUrl);
    expect(parser.type).toBe(Parser.Spotify);
    expect(parser.id).toBe("4HgkXIyPXtXueFq7swBqXa");
  });
});

describe("search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getYouTubeLink).mockResolvedValue(
      link(Adapter.YouTube, "https://music.youtube.com/playlist?list=x")
    );
    vi.mocked(getAppleMusicLink).mockResolvedValue(
      link(Adapter.AppleMusic, "https://music.apple.com/us/album/x/1")
    );
    vi.mocked(getDeezerLink).mockResolvedValue(
      link(Adapter.Deezer, "https://www.deezer.com/album/1")
    );
    vi.mocked(getSoundCloudLink).mockResolvedValue(
      link(Adapter.SoundCloud, "https://soundcloud.com/a/sets/b", false)
    );
    vi.mocked(getSpotifyLink).mockResolvedValue(undefined);
  });

  it("finds the album on every other platform from a Spotify link", async () => {
    const result = await search({ link: spotifyUrl, adapters: ALL_BUT_SPOTIFY });

    expect(result.title).toBe(albumMetadata.title);
    expect(result.type).toBe(MetadataType.Album);
    expect(result.source).toBe(spotifyUrl);
    expect(result.links.map((l) => l.type)).toEqual([
      Adapter.YouTube,
      Adapter.AppleMusic,
      Adapter.Deezer,
      Adapter.SoundCloud,
      Adapter.Tidal,
    ]);
    // The source platform is never searched again.
    expect(getSpotifyLink).not.toHaveBeenCalled();
  });

  it("drops platforms that returned nothing", async () => {
    vi.mocked(getDeezerLink).mockResolvedValue(undefined);
    vi.mocked(getSoundCloudLink).mockResolvedValue(undefined);

    const result = await search({ link: spotifyUrl, adapters: ALL_BUT_SPOTIFY });
    expect(result.links.map((l) => l.type)).toEqual([
      Adapter.YouTube,
      Adapter.AppleMusic,
      Adapter.Tidal,
    ]);
  });

  it("only adds the Tidal search link when some result is verified", async () => {
    vi.mocked(getYouTubeLink).mockResolvedValue(
      link(Adapter.YouTube, "https://music.youtube.com/x", false)
    );
    vi.mocked(getAppleMusicLink).mockResolvedValue(undefined);
    vi.mocked(getDeezerLink).mockResolvedValue(undefined);

    const result = await search({ link: spotifyUrl, adapters: ALL_BUT_SPOTIFY });
    expect(result.links.map((l) => l.type)).not.toContain(Adapter.Tidal);
  });

  it("skips platforms that weren't requested", async () => {
    await search({ link: spotifyUrl, adapters: [Adapter.YouTube] });
    expect(getYouTubeLink).toHaveBeenCalled();
    expect(getAppleMusicLink).not.toHaveBeenCalled();
    expect(getDeezerLink).not.toHaveBeenCalled();
  });

  it("returns the source link directly when it is the only adapter", async () => {
    const result = await search({ link: spotifyUrl, adapters: [Adapter.Spotify] });
    expect(result.links).toEqual([
      { type: Adapter.Spotify, url: spotifyUrl, isVerified: true },
    ]);
    expect(getYouTubeLink).not.toHaveBeenCalled();
  });
});

describe.skipIf(!process.env.RUN_LIVE_TESTS)("search (live)", () => {
  it(
    "resolves a real Spotify album across platforms",
    async () => {
      vi.doUnmock("@/parsers/spotify");
      vi.doUnmock("@/adapters/youtube");
      vi.doUnmock("@/adapters/apple-music");
      vi.doUnmock("@/adapters/deezer");
      vi.doUnmock("@/adapters/sound-cloud");
      vi.doUnmock("@/utils/url-shortener");
      vi.resetModules();
      const live = await import("@/server/services/search");

      const result = await live.search({
        link: spotifyUrl,
        adapters: [Adapter.YouTube, Adapter.AppleMusic, Adapter.Deezer],
      });
      expect(result.links.length).toBeGreaterThan(0);
    },
    60_000
  );
});
