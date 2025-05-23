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

  describe("search", async () => {
    const result = await search({
      link: spotifyUrl,
      adapters: [
        Adapter.YouTube,
        Adapter.AppleMusic,
        Adapter.Deezer,
        Adapter.SoundCloud,
        Adapter.Tidal,
      ],
    });

    expect(result.links).toHaveLength(5);
    expect(result.links.map((link) => link.type)).toContain(Adapter.YouTube);
    expect(result.links.map((link) => link.type)).toContain(Adapter.AppleMusic);
  });

  // test('Digital Album component correctly displays platform links', () => {
  //   render(<DigitalAlbum album={mockAlbum} />);
  //   expect(screen.getByText('Listen on YouTube Music')).toBeInTheDocument();
  //   expect(screen.getByText('Listen on Apple Music')).toBeInTheDocument();
  // });
});
