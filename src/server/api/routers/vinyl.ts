// ** Third-Party Imports
import { TRPCError } from "@trpc/server";
import { waitUntil } from "@vercel/functions";
import { z } from "zod";

// ** Custom Components, Hooks, Utils, etc.
import {
  EMBEDDING_MODELS,
  type EmbeddingModelKey,
} from "@/lib/embeddings/config";
import { l2Normalize } from "@/lib/embeddings/vector";
import { albumSelect } from "@/server/api/album-select";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { startScanIngest } from "@/server/services/catalog/background";
import { findSpotifyAlbum } from "@/server/services/catalog/spotify";
import {
  coverArtUrl,
  coverExists,
  discographyForArtist,
  lookupReleaseGroup,
  searchArtists,
  toCatalogAlbum,
} from "@/server/services/catalog/musicbrainz";
import {
  ARTIST_SUGGEST,
  suggestArtists,
} from "@/server/services/vinyl/artist-guess";
import { findNearestCovers } from "@/server/services/vinyl/index-search";
import {
  maybeSweepScanLog,
  scanIsActionable,
} from "@/server/services/vinyl/scan-log";
import { confirmScan } from "@/server/services/vinyl/confirm-scan";
import { getAlbumLinks } from "@/server/services/vinyl/links";
import { albumLinkDeps, indexAlbumLinks } from "@/server/services/links/server";
import {
  groupHitsByAlbum,
  pickBestView,
  rankHits,
} from "@/server/services/vinyl/ranking";

const spotifyWithin = (artist: string, title: string, ms: number) =>
  Promise.race([
    findSpotifyAlbum(artist, title).catch(() => null),
    new Promise<null>((r) => setTimeout(() => r(null), ms)),
  ]);

const modelKeys = Object.keys(EMBEDDING_MODELS) as [
  EmbeddingModelKey,
  ...EmbeddingModelKey[],
];

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const mbid = z.string().regex(/^[0-9a-f-]{36}$/i);

// Deep so one artist with many vectors can't crowd others out of suggestions.
const SEARCH_DEPTH = 60;

const DISCOGRAPHY_TTL_MS = 60 * 60 * 1000;
const discographyCache = new Map<
  string,
  { at: number; groups: Awaited<ReturnType<typeof discographyForArtist>> }
>();

export const vinylRouter = createTRPCRouter({
  identify: publicProcedure
    .input(
      z
        .object({
          model: z.enum(modelKeys),
          vectors: z.array(z.array(z.number().finite())).min(1).max(3),
          log: z.boolean().optional(),
          probe: z.boolean().optional(),
        })
        .refine(
          (v) =>
            v.vectors.every((x) => x.length === EMBEDDING_MODELS[v.model].dims),
          { message: "Vector size does not match the model", path: ["vectors"] }
        )
    )
    .mutation(async ({ ctx, input }) => {
      const views = await Promise.all(
        input.vectors.map(async (raw) => {
          const vector = l2Normalize(raw);
          const hits = await findNearestCovers(
            ctx.prisma,
            vector,
            input.model,
            SEARCH_DEPTH
          );
          return { vector, hits, ...rankHits(hits) };
        })
      );
      const best = views[pickBestView(views)];
      const { vector, status, candidates } = best;

      const near = groupHitsByAlbum(best.hits)
        .filter((r) => r.similarity >= ARTIST_SUGGEST.floor)
        .slice(0, ARTIST_SUGGEST.window);
      const albums = await ctx.prisma.album.findMany({
        where: {
          id: {
            in: [...new Set([...candidates, ...near].map((c) => c.albumId))],
          },
        },
        select: albumSelect,
      });
      const byId = new Map(albums.map((a) => [a.id, a]));
      const matches = candidates
        .filter((c) => byId.has(c.albumId))
        .map((c) => ({
          album: byId.get(c.albumId)!,
          similarity: Number(c.similarity.toFixed(4)),
        }));

      if (status === "matched" && matches[0]) {
        const top = matches[0].album;
        startScanIngest(
          ctx.prisma,
          {
            albumId: top.id,
            artist: {
              mbid: top.artistMbid,
              name: top.artistName ?? top.artist,
            },
          },
          "scan_match"
        );
      }

      const artistSuggestions =
        status === "matched"
          ? []
          : suggestArtists(
              near
                .filter((r) => byId.has(r.albumId))
                .map((r) => ({
                  similarity: r.similarity,
                  artist:
                    byId.get(r.albumId)!.artistName ??
                    byId.get(r.albumId)!.artist,
                  artistMbid: byId.get(r.albumId)!.artistMbid,
                }))
            );

      const skipLog = input.probe
        ? status !== "matched"
        : status === "none" && !input.log;
      const scan = skipLog
        ? null
        : await ctx.prisma.scanEvent.create({
            data: {
              model: input.model,
              vector,
              status,
              topAlbumIds: matches.map((m) => m.album.id),
              topScores: matches.map((m) => m.similarity),
              artistSuggestionMbids: artistSuggestions.map((a) => a.mbid),
            },
            select: { id: true },
          });
      const sweep = scan ? maybeSweepScanLog(ctx.prisma) : null;
      if (sweep) waitUntil(sweep);

      return {
        status,
        scanId: scan?.id ?? null,
        matches,
        artistSuggestions: artistSuggestions.map(({ name, mbid }) => ({
          name,
          mbid,
        })),
      };
    }),

  confirm: publicProcedure
    .input(
      z.object({
        scanId: objectId,
        albumId: objectId,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const scan = await ctx.prisma.scanEvent.findUnique({
        where: { id: input.scanId },
      });
      if (!scan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Scan not found" });
      }
      if (!scan.topAlbumIds.includes(input.albumId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Album was not a candidate for this scan",
        });
      }

      return confirmScan(ctx.prisma, scan, input.albumId);
    }),

  discography: publicProcedure
    .input(z.object({ artistMbid: mbid }))
    .query(async ({ ctx, input }) => {
      const cached = discographyCache.get(input.artistMbid);
      const groups =
        cached && Date.now() - cached.at < DISCOGRAPHY_TTL_MS
          ? cached.groups
          : await discographyForArtist(input.artistMbid);
      if (!cached || cached.groups !== groups) {
        discographyCache.set(input.artistMbid, { at: Date.now(), groups });
      }
      const known = await ctx.prisma.album.findMany({
        where: { mbid: { in: groups.map((g) => g.id) } },
        select: { id: true, mbid: true },
      });
      const albumIdByMbid = new Map(known.map((a) => [a.mbid, a.id]));
      return groups.map((g) => ({
        mbid: g.id,
        title: g.title,
        year:
          Number.parseInt(g["first-release-date"]?.slice(0, 4) ?? "", 10) ||
          null,
        type: g["primary-type"] ?? null,
        thumbUrl: coverArtUrl(g.id, 250),
        albumId: albumIdByMbid.get(g.id) ?? null,
      }));
    }),

  pick: publicProcedure
    .input(z.object({ scanId: objectId, mbid }))
    .mutation(async ({ ctx, input }) => {
      const scan = await ctx.prisma.scanEvent.findUnique({
        where: { id: input.scanId },
      });
      if (!scan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Scan not found" });
      }
      if (scan.confirmedAlbumId) {
        const album = await ctx.prisma.album.findUnique({
          where: { id: scan.confirmedAlbumId },
          select: albumSelect,
        });
        if (album) return { album };
      }
      if (!scanIsActionable(scan)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This scan has expired, please scan again",
        });
      }

      const sourceKey = `mb:${input.mbid}`;
      let album = await ctx.prisma.album.findUnique({
        where: { sourceKey },
        select: albumSelect,
      });
      if (!album) {
        const meta = toCatalogAlbum(await lookupReleaseGroup(input.mbid));
        const [spotify, hasCover] = await Promise.all([
          spotifyWithin(meta.artistName ?? meta.artist, meta.title, 2500),
          coverExists(input.mbid).catch(() => false),
        ]);
        album = await ctx.prisma.album.create({
          data: {
            sourceKey,
            mbid: meta.mbid,
            title: meta.title,
            artist: meta.artist,
            artistMbid: meta.artistMbid,
            artistName: meta.artistName,
            releaseYear: meta.releaseYear,
            primaryType: meta.primaryType,
            genres: meta.genres,
            tags: meta.tags,
            labels: [],
            coverUrl:
              spotify?.imageUrl ??
              (hasCover ? coverArtUrl(input.mbid, 500) : ""),
            spotifyId: spotify?.id ?? null,
            spotifyUrl: spotify?.url ?? null,
          },
          select: albumSelect,
        });
      }

      await ctx.prisma.coverEmbedding.create({
        data: {
          albumId: album.id,
          model: scan.model,
          vector: scan.vector,
          source: "user_scan",
        },
      });
      await ctx.prisma.scanEvent.update({
        where: { id: scan.id },
        data: { confirmedAlbumId: album.id, confirmedAt: new Date() },
      });

      startScanIngest(
        ctx.prisma,
        {
          albumId: album.id,
          artist: {
            mbid: album.artistMbid,
            name: album.artistName ?? album.artist,
          },
        },
        "scan_pick"
      );
      return { album };
    }),

  searchArtists: publicProcedure
    .input(z.object({ query: z.string().trim().min(2).max(80) }))
    .query(({ input }) => searchArtists(input.query)),

  album: publicProcedure
    .input(z.object({ id: objectId }))
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

  links: publicProcedure
    .input(z.object({ albumId: objectId }))
    .query(async ({ ctx, input }) => {
      const res = await getAlbumLinks(
        ctx.prisma,
        input.albumId,
        albumLinkDeps,
        Date.now(),
        {
          background: (task) => waitUntil(task),
          onResolved: (album, links) =>
            indexAlbumLinks(ctx.prisma, album, links),
        }
      );
      if (res.status === "not-found") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Album not found" });
      }
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
