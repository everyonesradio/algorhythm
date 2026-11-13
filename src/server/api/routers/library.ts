// ** Third-Party Imports
import { TRPCError } from "@trpc/server";
import { z } from "zod";

// ** Custom Components, Hooks, Utils, etc.
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import {
  addFind,
  findStatus,
  LibraryError,
  NOTE_MAX,
  removeFind,
} from "@/server/services/library/library";
import { confirmScan } from "@/server/services/vinyl/confirm-scan";

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
/** Random per-device key (src/hooks/use-device-key.ts); only its hash is stored. */
const deviceKey = z.string().regex(/^[\w-]{20,100}$/);

const toTrpc = (err: unknown) => {
  if (!(err instanceof LibraryError)) return err;
  const code =
    err.code === "scan-not-found"
      ? "NOT_FOUND"
      : err.code === "too-many"
        ? "TOO_MANY_REQUESTS"
        : err.code === "not-yours"
          ? "FORBIDDEN"
          : "BAD_REQUEST";
  return new TRPCError({ code, message: err.message, cause: err });
};

/**
 * The public library of records diggers have scanned (docs/PUBLIC_LIBRARY.md).
 * Open and anonymous: no accounts or handles yet.
 */
export const libraryRouter = createTRPCRouter({
  /** Add the record a scan just identified. */
  add: publicProcedure
    .input(
      z.object({
        scanId: objectId,
        albumId: objectId,
        deviceKey,
        // A little slack: the server trims and cuts to NOTE_MAX characters.
        note: z
          .string()
          .max(NOTE_MAX * 4)
          .nullish(),
        coverUrl: z.string().url().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await addFind(ctx.prisma, input, {
          confirm: (scan, albumId) => confirmScan(ctx.prisma, scan, albumId),
        });
      } catch (err) {
        throw toTrpc(err);
      }
    }),

  /** "Dug by N", and whether this scan's find is already in the library. */
  status: publicProcedure
    .input(
      z.object({
        albumId: objectId,
        scanId: objectId.nullish(),
        deviceKey: deviceKey.nullish(),
      })
    )
    .query(({ ctx, input }) => findStatus(ctx.prisma, input)),

  /** Undo an add, from the same phone. */
  remove: publicProcedure
    .input(z.object({ entryId: objectId, deviceKey }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await removeFind(ctx.prisma, input);
      } catch (err) {
        throw toTrpc(err);
      }
    }),
});
