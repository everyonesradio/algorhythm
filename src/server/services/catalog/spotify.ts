/**
 * Server-side Spotify lookup used while seeding (client-credentials flow).
 * Credentials never touch the browser.
 */
import { compareTwoStrings } from "string-similarity";

// Read lazily: scripts load .env after their imports have been evaluated.
const creds = () => ({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
});

let token: { value: string; expiresAt: number } | null = null;

export const spotifyEnabled = () => {
  const { clientId, clientSecret } = creds();
  return Boolean(clientId && clientSecret);
};

const getToken = async () => {
  if (token && token.expiresAt > Date.now() + 30_000) return token.value;
  const { clientId, clientSecret } = creds();
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Spotify auth failed: ${res.status}`);
  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  token = {
    value: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return token.value;
};

type SpotifyAlbum = {
  id: string;
  name: string;
  album_type: string;
  release_date: string;
  artists: { name: string }[];
  images: { url: string; width: number; height: number }[];
  external_urls: { spotify: string };
};

export type SpotifyMatch = {
  id: string;
  url: string;
  imageUrl: string | null;
  score: number;
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    // drop "(Deluxe Edition)", "[Remastered 2015]" etc.
    .replace(
      /[([].*?(deluxe|remaster|edition|version|expanded|anniversary).*?[)\]]/g,
      ""
    )
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const scoreSpotifyCandidate = (
  wanted: { artist: string; title: string },
  candidate: { artist: string; title: string }
) =>
  0.5 * compareTwoStrings(norm(wanted.title), norm(candidate.title)) +
  0.5 * compareTwoStrings(norm(wanted.artist), norm(candidate.artist));

export const findSpotifyAlbum = async (
  artist: string,
  title: string,
  minScore = 0.72
): Promise<SpotifyMatch | null> => {
  if (!spotifyEnabled()) return null;
  const params = new URLSearchParams({
    q: `album:${title} artist:${artist}`,
    type: "album",
    limit: "10",
  });

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://api.spotify.com/v1/search?${params}`, {
      headers: { Authorization: `Bearer ${await getToken()}` },
    });
    if (res.status === 429) {
      const retry = Number(res.headers.get("retry-after") ?? "2");
      await new Promise((r) => setTimeout(r, retry * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Spotify search ${res.status}`);

    const json = (await res.json()) as { albums: { items: SpotifyAlbum[] } };
    const best = json.albums.items
      .map((a) => ({
        album: a,
        score: scoreSpotifyCandidate(
          { artist, title },
          { artist: a.artists.map((x) => x.name).join(" "), title: a.name }
        ),
      }))
      .sort((a, b) => b.score - a.score)[0];

    if (!best || best.score < minScore) return null;
    return {
      id: best.album.id,
      url: best.album.external_urls.spotify,
      imageUrl: best.album.images[0]?.url ?? null,
      score: best.score,
    };
  }
  return null;
};
