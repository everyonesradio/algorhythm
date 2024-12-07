import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  shared: {
    NEXT_PUBLIC_BASE_URL: z.string().url(),
  },

  server: {
    DATABASE_URL: z.string().url(),

    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),

    SPOTIFY_AUTH_URL: z.string().url(),
    SPOTIFY_API_URL: z
      .string()
      .url()
      .default("https://api.spotify.com/v1/search"),
    SPOTIFY_CLIENT_VERSION: z.string(),
    YOUTUBE_MUSIC_URL: z
      .string()
      .url()
      .default("https://music.youtube.com/search"),
    YOUTUBE_COOKIES: z.string(),
    APPLE_MUSIC_API_URL: z.string().url().default("https://music.apple.com/us"),
    SOUNDCLOUD_BASE_URL: z.string().url().default("https://soundcloud.com"),
    TIDAL_BASE_URL: z.string().url().default("https://listen.tidal.com"),
    DEEZER_API_URL: z.string().url().default("https://api.deezer.com/search"),
    URL_SHORTENER_API_URL: z
      .string()
      .url()
      .default("http://localhost:4000/api/links"),
    URL_SHORTENER_API_KEY: z.string(),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_SPOTIFY_CLIENT_ID: z.string(),
    NEXT_PUBLIC_SPOTIFY_CLIENT_SECRET: z.string(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
    NEXT_PUBLIC_SPOTIFY_CLIENT_ID: process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID,
    NEXT_PUBLIC_SPOTIFY_CLIENT_SECRET:
      process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_SECRET,
    SPOTIFY_AUTH_URL: process.env.SPOTIFY_AUTH_URL,
    SPOTIFY_API_URL: process.env.SPOTIFY_API_URL,
    SPOTIFY_CLIENT_VERSION: process.env.SPOTIFY_CLIENT_VERSION,
    YOUTUBE_MUSIC_URL: process.env.YOUTUBE_MUSIC_URL,
    YOUTUBE_COOKIES: process.env.YOUTUBE_COOKIES,
    APPLE_MUSIC_API_URL: process.env.APPLE_MUSIC_API_URL,
    SOUNDCLOUD_BASE_URL: process.env.SOUNDCLOUD_BASE_URL,
    TIDAL_BASE_URL: process.env.TIDAL_BASE_URL,
    DEEZER_API_URL: process.env.DEEZER_API_URL,
    URL_SHORTENER_API_URL: process.env.URL_SHORTENER_API_URL,
    URL_SHORTENER_API_KEY: process.env.URL_SHORTENER_API_KEY,
  },

  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
