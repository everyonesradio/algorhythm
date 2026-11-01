// ** Third-Party Imports
import { TRPCError } from "@trpc/server";
import { z } from "zod";

// ** Custom Components, Hooks, Utils, etc.
import {
  EMBEDDING_MODELS,
  type EmbeddingModelKey,
} from "@/lib/embeddings/config";
import { l2Normalize } from "@/lib/embeddings/vector";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { search } from "@/server/services/search";
import { findNearestCovers } from "@/server/services/vinyl/index-search";
import { getAlbumLinks } from "@/server/services/vinyl/links";
import { rankHits } from "@/server/services/vinyl/ranking";

const modelKeys = Object.keys(EMBEDDING_MODELS) as [
  EmbeddingModelKey,
  ...EmbeddingModelKey[],
];

/** Cap on confirmed real-world scans stored per album (keeps index lean). */
const MAX_USER_SCANS_PER_ALBUM = 25;

const albumSelect = {
  id: true,
  title: true,
  artist: true,
  releaseYear: true,
  primaryType: true,
  genres: true,
  tags: true,
  labels: true,
  coverUrl: true,
  spotifyId: true,
  spotifyUrl: true,
  mbid: true,
} as const;

export const vinylRouter = createTRPCRouter({
  /**
   * Takes a cover embedding computed on the device and returns the closest
   * albums. Only the vector crosses the network, never the camera frame.
   */
  identify: publicProcedure
    .input(
      z
        .object({
          model: z.enum(modelKeys),
          vector: z.array(z.number().finite()),
        })
        .refine((v) => v.vector.length === EMBEDDING_MODELS[v.model].dims, {
          message: "Vector size does not match the model",
          path: ["vector"],
        })
    )
    .mutation(async ({ ctx, input }) => {
      const vector = l2Normalize(input.vector);
      const hits = await findNearestCovers(ctx.prisma, vector, input.model);
      const { status, candidates } = rankHits(hits);

      const albums = await ctx.prisma.album.findMany({
        where: { id: { in: candidates.map((c) => c.albumId) } },
        select: albumSelect,
      });
      const byId = new Map(albums.map((a) => [a.id, a]));
      const matches = candidates
        .filter((c) => byId.has(c.albumId))
        .map((c) => ({
          album: byId.get(c.albumId)!,
          similarity: Number(c.similarity.toFixed(4)),
        }));

      // Only log scans that found something; "none" frames are noise.
      const scan =
        status === "none"
          ? null
          : await ctx.prisma.scanEvent.create({
              data: {
                model: input.model,
                vector,
                status,
                topAlbumIds: matches.map((m) => m.album.id),
                topScores: matches.map((m) => m.similarity),
              },
              select: { id: true },
            });

      return { status, scanId: scan?.id ?? null, matches };
    }),

  /**
   * The user confirmed which album they were holding. Store their camera's
   * vector as an extra embedding for that album: real-world photos (glare,
   * angle, sleeve wear) make future scans of the same record more reliable.
   */
  confirm: publicProcedure
    .input(
      z.object({
        scanId: z.string().regex(/^[a-f\d]{24}$/i),
        albumId: z.string().regex(/^[a-f\d]{24}$/i),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const scan = await ctx.prisma.scanEvent.findUnique({
        where: { id: input.scanId },
      });
      if (!scan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Scan not found" });
      }
      if (scan.confirmedAlbumId) {
        return { stored: false, reason: "already-confirmed" as const };
      }
      // Only accept albums the search actually offered; stops bad writes.
      if (!scan.topAlbumIds.includes(input.albumId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Album was not a candidate for this scan",
        });
      }

      await ctx.prisma.scanEvent.update({
        where: { id: scan.id },
        data: { confirmedAlbumId: input.albumId, confirmedAt: new Date() },
      });

      const existing = await ctx.prisma.coverEmbedding.count({
        where: {
          albumId: input.albumId,
          model: scan.model,
          source: "user_scan",
        },
      });
      if (existing >= MAX_USER_SCANS_PER_ALBUM) {
        return { stored: false, reason: "album-has-enough-scans" as const };
      }

      await ctx.prisma.coverEmbedding.create({
        data: {
          albumId: input.albumId,
          model: scan.model,
          vector: scan.vector,
          source: "user_scan",
        },
      });
      return { stored: true, reason: null };
    }),

  album: publicProcedure
    .input(z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) }))
    .query(async ({ ctx, input }) => {
      const album = await ctx.prisma.album.findUnique({
        where: { id: input.id },
        select: albumSelect,
      });
      if (!album) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Album not found" });
      }
      return album;
    }),

  /**
   * Streaming links for an album across Spotify, Apple Music, YouTube,
   * Deezer, SoundCloud and Tidal. Cached on the album (30-day TTL), so a
   * record that's been scanned before resolves instantly.
   * `links` is null when the album has no Spotify match to search from.
   */
  links: publicProcedure
    .input(z.object({ albumId: z.string().regex(/^[a-f\d]{24}$/i) }))
    .query(async ({ ctx, input }) => {
      const res = await getAlbumLinks(ctx.prisma, input.albumId, search);
      if (res.status === "not-found") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Album not found" });
      }
      if (res.status === "no-spotify") return { links: null, cached: false };
      return { links: res.links, cached: res.cached };
    }),

  stats: publicProcedure.query(async ({ ctx }) => {
    const [albums, embeddings] = await Promise.all([
      ctx.prisma.album.count(),
      ctx.prisma.coverEmbedding.count(),
    ]);
    return { albums, embeddings };
  }),
});
