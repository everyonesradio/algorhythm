// ** Custom Components, Hooks, Utils, etc.
import packageJson from "../../package.json";

// Defaults mirror src/env.js so code paths work even when validation is
// skipped (tests, scripts) and the variable isn't set.
export const ENV = {
  adapters: {
    spotify: {
      authUrl:
        process.env.SPOTIFY_AUTH_URL ??
        "https://accounts.spotify.com/api/token",
      clientId: process.env.SPOTIFY_CLIENT_ID!,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET!,
      apiUrl:
        process.env.SPOTIFY_API_URL ?? "https://api.spotify.com/v1/search",
      clientVersion: process.env.SPOTIFY_CLIENT_VERSION!,
    },
    youTube: {
      musicUrl:
        process.env.YOUTUBE_MUSIC_URL ?? "https://music.youtube.com/search",
      cookies: process.env.YOUTUBE_COOKIES!,
    },
    deezer: {
      apiUrl: process.env.DEEZER_API_URL ?? "https://api.deezer.com/search",
    },
    appleMusic: {
      apiUrl:
        process.env.APPLE_MUSIC_API_URL ?? "https://music.apple.com/us",
    },
    tidal: {
      baseUrl: process.env.TIDAL_BASE_URL ?? "https://listen.tidal.com",
    },
    soundCloud: {
      baseUrl: process.env.SOUNDCLOUD_BASE_URL ?? "https://soundcloud.com",
    },
  },
  utils: {
    urlShortener: {
      apiUrl: process.env.URL_SHORTENER_API_URL!,
      apiKey: process.env.URL_SHORTENER_API_KEY!,
    },
  },
  app: {
    url: process.env.NEXT_PUBLIC_BASE_URL!,
    version: packageJson.version,
  },
  cache: {
    databasePath: process.env.DATABASE_PATH ?? ":memory:",
    expTime: 60 * 60 * 24 * 7, // 1 week in seconds
  },
};
