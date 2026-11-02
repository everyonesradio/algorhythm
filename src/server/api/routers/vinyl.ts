// ** Third-Party Imports
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { Adapter } from "@/config/enum";

// ** Custom Components, Hooks, Utils, etc.
import {
  EMBEDDING_MODELS,
  type EmbeddingModelKey,
} from "@/lib/embeddings/config";
import { l2Normalize } from "@/lib/embeddings/vector";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { startScanIngest } from "@/server/services/catalog/background";
import {
  coverArtUrl,
  coverExists,
  discographyForArtist,
  lookupReleaseGroup,
  releasesWithUrls,
  searchArtists,
  toCatalogAlbum,
} from "@/server/services/catalog/musicbrainz";
import { search } from "@/server/services/search";
import {
  ARTIST_SUGGEST,
  suggestArtists,
} from "@/server/services/vinyl/artist-guess";
import { findNearestCovers } from "@/server/services/vinyl/index-search";
import { getAlbumLinks, type LinkDeps } from "@/server/services/vinyl/links";
import {
  appleByBarcode,
  appleBySearch,
  deezerByBarcode,
  deezerBySearch,
} from "@/server/services/vinyl/platform-links";
import {
  groupHitsByAlbum,
  pickBestView,
  rankHits,
} from "@/server/services/vinyl/ranking";

const modelKeys = Object.keys(EMBEDDING_MODELS) as [
  EmbeddingModelKey,
  ...EmbeddingModelKey[],
];

/** Cap on confirmed real-world scans stored per album (keeps index lean). */
const MAX_USER_SCANS_PER_ALBUM = 25;

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const mbid = z.string().regex(/^[0-9a-f-]{36}$/i);

/** Vector hits per crop (an album has ~6 vectors, so ~10+ albums). */
const SEARCH_DEPTH = 60;

/** A scan can be turned into a picked album only this soon after. */
const PICK_WINDOW_MS = 30 * 60 * 1000;

/** Discographies change rarely; cache per server instance for an hour. */
const DISCOGRAPHY_TTL_MS = 60 * 60 * 1000;
const discographyCache = new Map<
  string,
  { at: number; groups: Awaited<ReturnType<typeof discographyForArtist>> }
>();

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
  artistMbid: true,
  artistName: true,
  styles: true,
  discogsMasterId: true,
  discogsReleaseId: true,
} as const;

const linkDeps: LinkDeps = {
  releases: releasesWithUrls,
  byBarcode: {
    [Adapter.AppleMusic]: appleByBarcode,
    [Adapter.Deezer]: deezerByBarcode,
  },
  bySearch: {
    [Adapter.AppleMusic]: appleBySearch,
    [Adapter.Deezer]: deezerBySearch,
  },
  search,
};

export const vinylRouter = createTRPCRouter({
  /**
   * Takes cover embeddings computed on the device and returns the closest
   * albums. Only vectors cross the network, never the camera frame.
   *
   * `vectors` are 1-3 crops of the same frame at different scales (record
   * held close / at arm's length). Each is searched and the most useful
   * result wins, so the user doesn't have to hit an exact distance.
   */
  identify: publicProcedure
    .input(
      z
        .object({
          model: z.enum(modelKeys),
          vectors: z.array(z.array(z.number().finite())).min(1).max(3),
          /**
           * Keep this scan even if nothing matched, so the user can pick the
           * record by hand (uploads, and when the camera rests on an
           * unknown cover). Live "none" frames are otherwise not stored.
           */
          log: z.boolean().optional(),
          /**
           * A quick first look the client may follow with more crops of the
           * same frame: only store it if it matched, so a frame isn't
           * logged twice.
           */
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
          // Deep enough that one artist's large catalog can't crowd every
          // other artist out of the suggestions.
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

      // Albums near enough to hint at the artist (looser than candidates).
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
      // Which cover each album looks most like, over every crop of the
      // frame: the crop that decided the match isn't always the one that
      // shows the artwork best.
      const imageById = new Map(
        groupHitsByAlbum(views.flatMap((v) => v.hits)).map((r) => [
          r.albumId,
          r.image,
        ])
      );
      const matches = candidates
        .filter((c) => byId.has(c.albumId))
        .map((c) => {
          const album = byId.get(c.albumId)!;
          // Matched an alternative cover (another pressing, the Spotify art):
          // show the user the cover they're actually holding.
          const img = imageById.get(c.albumId) ?? c.image;
          const scannedCover =
            img &&
            (img.source === "variant" || img.source === "spotify") &&
            img.url !== album.coverUrl
              ? img.url
              : undefined;
          return {
            album,
            similarity: Number(c.similarity.toFixed(4)),
            ...(scannedCover ? { scannedCover } : {}),
          };
        });

      if (status === "matched" && matches[0]) {
        // A confident scan is itself the signal: vectorise this artist's
        // whole catalog in the background (no-op if already done).
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

      // Log scans that found something, or that the user may pick from by
      // hand; other "none" frames are noise.
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

  /**
   * The user confirmed which album they were holding. Store their camera's
   * vector as an extra embedding for that album: real-world photos (glare,
   * angle, sleeve wear) make future scans of the same record more reliable.
   */
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

      // A confirmed record: make sure the rest of this artist's catalog is in.
      const confirmed = await ctx.prisma.album.findUnique({
        where: { id: input.albumId },
        select: { artist: true, artistMbid: true, artistName: true },
      });
      if (confirmed) {
        startScanIngest(
          ctx.prisma,
          {
            albumId: input.albumId,
            artist: {
              mbid: confirmed.artistMbid,
              name: confirmed.artistName ?? confirmed.artist,
            },
          },
          "scan_confirm"
        );
      }

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

  /**
   * The artist's discography (albums + EPs, newest first) for the "Looks
   * like Kendrick Lamar, which one?" picker. `albumId` is set for records
   * already in the catalog.
   */
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

  /**
   * The user picked the right record from the artist's discography. The
   * album joins the catalog immediately with *their scan* as its first
   * vector (so the next scan of it matches), and the artist's whole catalog
   * starts vectorising in the background.
   */
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
      // A scan is single-use and short-lived: every picked album carries a
      // real camera vector taken moments ago, not an arbitrary write.
      if (Date.now() - scan.createdAt.getTime() > PICK_WINDOW_MS) {
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
        // New record: one MusicBrainz lookup for its metadata (~1s).
        const meta = toCatalogAlbum(await lookupReleaseGroup(input.mbid));
        // Existence check only; the image itself is fetched by the browser.
        const hasCover = await coverExists(input.mbid).catch(() => false);
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
            coverUrl: hasCover ? coverArtUrl(input.mbid, 500) : "",
          },
          select: albumSelect,
        });
      }

      // The user's own photo is the album's first real-world view.
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

  /** "Search artist" fallback for records whose artist we didn't suggest. */
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

  /**
   * Streaming links for an album across Spotify, Apple Music, YouTube,
   * Tidal, Deezer and SoundCloud, from exact sources first (see
   * services/vinyl/links.ts). Cached on the album (30-day TTL), so a record
   * that's been scanned before resolves instantly.
   */
  links: publicProcedure
    .input(z.object({ albumId: objectId }))
    .query(async ({ ctx, input }) => {
      const res = await getAlbumLinks(ctx.prisma, input.albumId, linkDeps);
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
