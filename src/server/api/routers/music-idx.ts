// ** Third-Party Imports
import { TRPCError } from "@trpc/server";
import { z } from "zod";

// ** Custom Components, Hooks, Utils, etc.
import { createTRPCRouter, publicProcedure } from "../../api/trpc";
import { Adapter } from "@/config/enum";
import { search, SearchResult } from "@/server/services/search";

export const musicIDXRouter = createTRPCRouter({
  add: publicProcedure
    .input(
      z.object({
        artistName: z.string().optional(),
        artistLink: z.string().optional(),
        albumLink: z.string().optional(),
        spotifyId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.musicIDX.create({
        data: {
          ...input,
          createdAt: new Date(),
        },
      });

      return {
        message: "Album data stored successfully!",
      };
    }),

  // Call to add platformLinks by spotifyId
  search: publicProcedure
    .input(
      z.object({
        albumLink: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const searchResult = await search({
        link: input.albumLink,
        adapters: [
          // Adapter.Spotify,
          Adapter.YouTube,
          Adapter.AppleMusic,
          Adapter.Deezer,
          Adapter.SoundCloud,
          Adapter.Tidal,
        ],
      });

      if (!searchResult) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Album not found",
        });
      }

      return {
        message: "Album data retrieved successfully!",
        links: searchResult,
      };
    }),
});
