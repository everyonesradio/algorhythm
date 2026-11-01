// ** Third-Party Imports
import { TRPCError } from "@trpc/server";
import { z } from "zod";

// ** Custom Components, Hooks, Utils, etc.
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { search } from "@/server/services/search";
import { LINK_ADAPTERS } from "@/server/services/vinyl/links";

/**
 * Cross-platform link search for ANY music URL (Spotify, Apple Music,
 * YouTube Music, Deezer, SoundCloud): returns the same release on the other
 * platforms. Formerly `musicIDX.search`.
 *
 * For scanned albums prefer `vinyl.links`, which caches the result on the
 * Album document; this procedure only has the per-instance memory cache.
 */
export const linksRouter = createTRPCRouter({
  search: publicProcedure
    .input(z.object({ link: z.string().url() }))
    .query(async ({ input }) => {
      try {
        return await search({ link: input.link, adapters: LINK_ADAPTERS });
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Couldn't resolve that link: ${(err as Error).message}`,
          cause: err,
        });
      }
    }),
});
