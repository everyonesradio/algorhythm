// ** Third-Party Imports
import { z } from "zod";

// ** Custom Components, Hooks, Utils, etc.
import { createTRPCRouter, publicProcedure } from "../trpc";

export const musicIDXRouter = createTRPCRouter({
  add: publicProcedure
    .input(
      z.object({
        spotifyData: z.object({}).optional(),
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
});
