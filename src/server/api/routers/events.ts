// ** Third-Party Imports
import { TRPCError } from "@trpc/server";
import { z } from "zod";

// ** Custom Components, Hooks, Utils, etc.
import { albumSelect } from "@/server/api/album-select";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import {
  checkJoin,
  EventError,
  eventBoard,
  listEvents,
} from "@/server/services/library/events";

export const eventSlugInput = z.string().regex(/^[a-z0-9-]{1,60}$/);
export const joinCodeInput = z.string().min(4).max(12);

/**
 * Pop-ups ("Stump the Algorithm" nights). Created with `npm run vinyl:event`;
 * phones join with the code on the QR at the venue.
 */
export const eventsRouter = createTRPCRouter({
  /** Check a join link; the phone then credits its finds to this pop-up. */
  join: publicProcedure
    .input(z.object({ slug: eventSlugInput, code: joinCodeInput }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await checkJoin(ctx.prisma, input);
      } catch (err) {
        if (!(err instanceof EventError)) throw err;
        throw new TRPCError({
          code: err.code === "not-found" ? "NOT_FOUND" : "BAD_REQUEST",
          message: err.message,
          cause: err,
        });
      }
    }),

  /** The event page: details, scoreboard and every find in order. */
  board: publicProcedure
    .input(z.object({ slug: eventSlugInput }))
    .query(async ({ ctx, input }) => {
      const board = await eventBoard(ctx.prisma, input.slug, albumSelect);
      if (!board)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That pop-up doesn't exist.",
        });
      return board;
    }),

  /** Live, upcoming and recent pop-ups, for the library page. */
  list: publicProcedure.query(({ ctx }) => listEvents(ctx.prisma)),
});
