// ** Third-Party Imports
import { TRPCError } from "@trpc/server";
import { z } from "zod";

// ** Custom Components, Hooks, Utils, etc.
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { UnsupportedLinkError } from "@/server/services/links/resolve-link";
import { resolveLinkOnServer } from "@/server/services/links/server";

/**
 * Paste any music link (Spotify, Apple Music, Deezer, Tidal, YouTube Music
 * or SoundCloud album/track) and get the same album on the other platforms.
 * Formerly `musicIDX.search`, which scraped platform pages; now every link
 * comes from official APIs and MusicBrainz (services/links/resolve-link.ts).
 */
export const linksRouter = createTRPCRouter({
  search: publicProcedure
    .input(z.object({ link: z.string().url() }))
    .query(async ({ ctx, input }) => {
      try {
        return await resolveLinkOnServer(ctx.prisma, input.link);
      } catch (err) {
        throw new TRPCError({
          code:
            err instanceof UnsupportedLinkError
              ? "BAD_REQUEST"
              : "INTERNAL_SERVER_ERROR",
          message: `Couldn't resolve that link: ${(err as Error).message}`,
          cause: err,
        });
      }
    }),
});
