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
  findStatus,
  LibraryError,
  libraryFacets,
  libraryStats,
  listLibrary,
  NOTE_MAX,
  removeFind,
  reportFind,
} from "@/server/services/library/library";
import { wikidataInfo } from "@/server/services/library/wikidata";
import { confirmScan } from "@/server/services/vinyl/confirm-scan";

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
/** Random per-device key (src/hooks/use-device-key.ts); only its hash is stored. */
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
        const res = await addFind(ctx.prisma, input, {
          confirm: (scan, albumId) => confirmScan(ctx.prisma, scan, albumId),
        });
        // Fetch tracklist and about text now, so the library page has them.
        if (res.created) {
          // Background lane: people waiting on screen go first at MusicBrainz.
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

  /** The library grid: albums people have dug, newest find first or most dug. */
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

  /** Header counter: records and finds. */
  stats: publicProcedure.query(({ ctx }) => libraryStats(ctx.prisma)),

  /** Genres and decades present, for the filter chips. */
  facets: publicProcedure.query(({ ctx }) => libraryFacets(ctx.prisma)),

  /** The latest few finds of one album (notes and dates). */
  finds: publicProcedure
    .input(z.object({ albumId: objectId, deviceKey: deviceKey.nullish() }))
    .query(({ ctx, input }) => albumFinds(ctx.prisma, input)),

  /** Tracklist, short about text and links to reviews, cached per album. */
  details: publicProcedure
    .input(z.object({ albumId: objectId }))
    .query(({ ctx, input }) =>
      getAlbumDetails(ctx.prisma, input.albumId, detailsDeps)
    ),

  /** Report a find; three reports from different phones hide it. */
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
