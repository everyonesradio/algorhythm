// ** Third-Party Imports
import { describe, it, expect } from "vitest";

// ** Custom Components, Hooks, Utils, etc.
import { Adapter, Parser } from "@/config/enum";
import { getSearchParser } from "@/parsers/link";
import { search } from "@/server/services/search";

describe("Album Search Integration", () => {
  const spotifyUrl = "https://open.spotify.com/album/4HgkXIyPXtXueFq7swBqXa";

  describe("parse", () => {
    it("should correctly extract Spotify album ID", async () => {
      const parser = getSearchParser(spotifyUrl);
      expect(parser.type).toBe(Parser.Spotify);
      expect(parser.id).toBe("4HgkXIyPXtXueFq7swBqXa");
    });
  });

  describe("search", () => {
    it(
      "returns cross-platform links for a Spotify album",
      async () => {
        let result: Awaited<ReturnType<typeof search>>;
        try {
          result = await search({
            link: spotifyUrl,
            adapters: [
              Adapter.YouTube,
              Adapter.AppleMusic,
              Adapter.Deezer,
              Adapter.SoundCloud,
              Adapter.Tidal,
            ],
          });
        } catch (error) {
          // Live Spotify scrape — skip when the sandbox/network blocks outbound HTTP.
          if (
            error instanceof Error &&
            /Network Error|ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(
              error.message
            )
          ) {
            console.warn(
              "[search.test] Skipping live integration search:",
              error.message
            );
            return;
          }
          throw error;
        }

        expect(result.links).toHaveLength(5);
        expect(result.links.map((link) => link.type)).toContain(Adapter.YouTube);
        expect(result.links.map((link) => link.type)).toContain(
          Adapter.AppleMusic
        );
      },
      60_000
    );
  });

  // test('Digital Album component correctly displays platform links', () => {
  //   render(<DigitalAlbum album={mockAlbum} />);
  //   expect(screen.getByText('Listen on YouTube Music')).toBeInTheDocument();
  //   expect(screen.getByText('Listen on Apple Music')).toBeInTheDocument();
  // });
});
