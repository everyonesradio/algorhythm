// ** Third-Party Imports
import { TRPCError } from "@trpc/server";
import { z } from "zod";

// ** Custom Components, Hooks, Utils, etc.
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { UnsupportedLinkError } from "@/server/services/links/resolve-link";
import { resolveLinkOnServer } from "@/server/services/links/server";
import { logger } from "@/utils/logger";

export const linksRouter = createTRPCRouter({
  search: publicProcedure
    .input(z.object({ link: z.string().max(2048).url() }))
    .query(async ({ ctx, input }) => {
      try {
        return await resolveLinkOnServer(ctx.prisma, input.link);
      } catch (err) {
        if (err instanceof UnsupportedLinkError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Couldn't resolve that link: ${err.message}`,
            cause: err,
          });
        }
        logger.error({ err }, "links: resolve failed");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Couldn't resolve that link right now",
          cause: err,
        });
      }
    }),
});
