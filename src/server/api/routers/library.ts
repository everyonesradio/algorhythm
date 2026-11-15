// ** Third-Party Imports
import { TRPCError } from "@trpc/server";
import { waitUntil } from "@vercel/functions";
import { z } from "zod";

// ** Custom Components, Hooks, Utils, etc.
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { albumSelect } from "@/server/api/album-select";
import {
  releaseGroupLinks,
  releasesWithTracks,
  artistWikidata,
} from "@/server/services/catalog/musicbrainz";
import { runInBackground } from "@/server/services/catalog/rate-lanes";
import { spotifyAlbumTracks } from "@/server/services/catalog/spotify";
import { getAlbumDetails } from "@/server/services/library/album-details";
import {
  addFind,
  albumFinds,
  LibraryError,
  libraryFacets,
  libraryStats,
  listLibrary,
  NOTE_MAX,
  removeFind,
  reportFind,
  setNote,
} from "@/server/services/library/library";
import { wikidataInfo } from "@/server/services/library/wikidata";

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const deviceKey = z.string().regex(/^[\w-]{20,100}$/);

const detailsDeps = {
  releasesWithTracks,
  releaseGroupLinks,
  artistWikidata,
  wikidata: wikidataInfo,
  spotifyTracks: spotifyAlbumTracks,
};

const toTrpc = (err: unknown) => {
  if (!(err instanceof LibraryError)) return err;
  const code =
    err.code === "scan-not-found"
      ? "NOT_FOUND"
      : err.code === "not-found"
        ? "NOT_FOUND"
        : err.code === "too-many"
          ? "TOO_MANY_REQUESTS"
          : err.code === "not-yours"
            ? "FORBIDDEN"
            : "BAD_REQUEST";
  return new TRPCError({ code, message: err.message, cause: err });
};

export const libraryRouter = createTRPCRouter({
  add: publicProcedure
    .input(
      z.object({
        scanId: objectId,
        albumId: objectId,
        deviceKey,
        // Loose on purpose: the service trims and cuts to NOTE_MAX.
        note: z
          .string()
          .max(NOTE_MAX * 4)
          .nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const res = await addFind(ctx.prisma, input);
        if (res.created) {
          waitUntil(
            runInBackground(() =>
              getAlbumDetails(ctx.prisma, input.albumId, detailsDeps)
            ).catch(() => null)
          );
        }
        return res;
      } catch (err) {
        throw toTrpc(err);
      }
    }),

  remove: publicProcedure
    .input(z.object({ entryId: objectId, deviceKey }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await removeFind(ctx.prisma, input);
      } catch (err) {
        throw toTrpc(err);
      }
    }),

  note: publicProcedure
    .input(
      z.object({
        entryId: objectId,
        deviceKey,
        note: z
          .string()
          .max(NOTE_MAX * 4)
          .nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await setNote(ctx.prisma, input);
      } catch (err) {
        throw toTrpc(err);
      }
    }),

  list: publicProcedure
    .input(
      z.object({
        sort: z.enum(["recent", "most"]).default("recent"),
        genre: z.string().max(60).nullish(),
        decade: z.number().int().min(1900).max(2100).multipleOf(10).nullish(),
        cursor: z.number().int().min(0).max(10_000).nullish(),
        limit: z.number().int().min(1).max(48).default(24),
      })
    )
    .query(({ ctx, input }) =>
      listLibrary(
        ctx.prisma,
        { ...input, offset: input.cursor ?? 0 },
        { ...albumSelect, libraryCount: true, libraryLastAt: true }
      )
    ),

  stats: publicProcedure.query(({ ctx }) => libraryStats(ctx.prisma)),

  facets: publicProcedure.query(({ ctx }) => libraryFacets(ctx.prisma)),

  finds: publicProcedure
    .input(z.object({ albumId: objectId, deviceKey: deviceKey.nullish() }))
    .query(({ ctx, input }) => albumFinds(ctx.prisma, input)),

  details: publicProcedure
    .input(z.object({ albumId: objectId }))
    .query(({ ctx, input }) =>
      getAlbumDetails(ctx.prisma, input.albumId, detailsDeps)
    ),

  report: publicProcedure
    .input(z.object({ entryId: objectId, deviceKey }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await reportFind(ctx.prisma, input);
      } catch (err) {
        throw toTrpc(err);
      }
    }),
});
