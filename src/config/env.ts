// ** Custom Components, Hooks, Utils, etc.
import packageJson from "../../package.json";

export const ENV = {
  adapters: {
    spotify: {
      authUrl: process.env.SPOTIFY_AUTH_URL!,
      clientId: process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID!,
      clientSecret: process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_SECRET!,
      apiUrl: process.env.SPOTIFY_API_URL!,
      clientVersion: process.env.SPOTIFY_CLIENT_VERSION!,
    },
    youTube: {
      musicUrl: process.env.YOUTUBE_MUSIC_URL!,
      cookies: process.env.YOUTUBE_COOKIES!,
    },
    deezer: {
      apiUrl: process.env.DEEZER_API_URL!,
    },
    appleMusic: {
      apiUrl: process.env.APPLE_MUSIC_API_URL!,
    },
    tidal: {
      baseUrl: process.env.TIDAL_BASE_URL!,
    },
    soundCloud: {
      baseUrl: process.env.SOUNDCLOUD_BASE_URL!,
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
