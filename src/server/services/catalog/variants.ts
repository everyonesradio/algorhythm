import type { Embedder } from "@/lib/embeddings/embedder";
import { dot } from "@/lib/embeddings/vector";

import {
  cleanArtistName,
  type DgMaster,
  fetchDiscogsImage,
  findDiscogsAlbum,
  getMaster,
  getRelease,
  primaryImage,
  vinylVersions,
} from "./discogs";
import { toRawImage } from "./images";

/**
 * Alternative covers from Discogs vinyl pressings.
 *
 * An album's pressings can carry different artwork (reissue art, club
 * editions, picture discs) and Discogs has photos of the actual sleeves,
 * stickers and shrink-wrap included. Each distinct cover becomes a
 * "variant" vector on the same album, so any edition matches.
 */

/** Distinct covers kept per album. */
export const MAX_VARIANTS = 6;
/** Two covers at least this similar count as the same artwork. */
export const DUPLICATE_SIMILARITY = 0.95;
/** Pressings looked at per album (thumbnails are cheap, CDN-served). */
export const MAX_VERSIONS = 30;

/**
 * Farthest-first selection: start from the first item (the original
 * pressing), then keep adding the item least like everything selected so
 * far. Alternative artwork is the most different, so it's picked early
 * instead of being crowded out by many photos of the classic cover.
 * Items too similar to the selection (>= duplicate) are never added.
 */
export const pickDiverse = <T extends { vector: number[] }>(
  items: T[],
  max = MAX_VARIANTS,
  duplicate = DUPLICATE_SIMILARITY
): T[] => {
  if (items.length === 0) return [];
  const selected: T[] = [items[0]];
  const rest = items.slice(1);
  while (selected.length < max && rest.length > 0) {
    let bestIdx = -1;
    let bestScore = Infinity;
    rest.forEach((item, i) => {
      const closest = Math.max(...selected.map((s) => dot(s.vector, item.vector)));
      if (closest < duplicate && closest < bestScore) {
        bestScore = closest;
        bestIdx = i;
      }
    });
    if (bestIdx < 0) break; // everything left is a duplicate
    selected.push(rest.splice(bestIdx, 1)[0]);
  }
  return selected;
};

export type VariantView = {
  source: "variant";
  vector: number[];
  imageUrl: string;
  /** Discogs release (pressing) the photo belongs to. */
  releaseId: number;
  /** e.g. "2024 · US · LP, Album, Limited Edition" */
  note: string;
};

export type DiscogsAlbumInfo = {
  masterId: number | null;
  releaseId: number;
  artistId: number | null;
  title: string;
  artist: string;
  year: number | null;
  genres: string[];
  styles: string[];
  labels: string[];
  coverUrl: string | null;
};

/** Album-level metadata from a Discogs master (or lone release). */
const describe = async (
  hit: { type: "master" | "release"; id: number }
): Promise<{ info: DiscogsAlbumInfo; master: DgMaster | null } | null> => {
  if (hit.type === "master") {
    const master = await getMaster(hit.id);
    if (!master) return null;
    const main = await getRelease(master.main_release);
    return {
      master,
      info: {
        masterId: master.id,
        releaseId: master.main_release,
        artistId: master.artists[0]?.id ?? null,
        title: master.title,
        artist: cleanArtistName(master.artists[0]?.name ?? ""),
        year: master.year || null,
        genres: master.genres ?? [],
        styles: master.styles ?? [],
        labels: [...new Set((main?.labels ?? []).map((l) => cleanArtistName(l.name)))],
        coverUrl: primaryImage(master.images) ?? primaryImage(main?.images),
      },
    };
  }
  const release = await getRelease(hit.id);
  if (!release) return null;
  return {
    master: null,
    info: {
      masterId: release.master_id ?? null,
      releaseId: release.id,
      artistId: release.artists[0]?.id ?? null,
      title: release.title,
      artist: cleanArtistName(release.artists[0]?.name ?? ""),
      year: release.year || null,
      genres: release.genres ?? [],
      styles: release.styles ?? [],
      labels: [...new Set((release.labels ?? []).map((l) => cleanArtistName(l.name)))],
      coverUrl: primaryImage(release.images),
    },
  };
};

/**
 * Look the album up on Discogs and return its metadata plus vectors for
 * its distinct vinyl covers. Null when Discogs doesn't know the album.
 */
export const discogsAlbum = async (
  embedder: Embedder,
  artist: string,
  title: string,
  opts: { variants?: boolean } = {}
): Promise<{ info: DiscogsAlbumInfo; variants: VariantView[] } | null> => {
  const hit = await findDiscogsAlbum(artist, title);
  if (!hit) return null;
  const described = await describe(hit);
  if (!described) return null;
  const { info, master } = described;
  if (!opts.variants || !master) return { info, variants: [] };

  // 1. Embed every pressing's thumbnail (CDN, no API cost).
  const versions = (await vinylVersions(master.id, MAX_VERSIONS)).filter((v) => v.thumb);
  const candidates: { id: number; note: string; vector: number[] }[] = [];
  for (const v of versions) {
    const img = await fetchDiscogsImage(v.thumb!);
    if (!img) continue;
    try {
      const vector = await embedder.embed(await toRawImage(embedder, img));
      const note = [v.released?.slice(0, 4), v.country, v.format]
        .filter(Boolean)
        .join(" · ");
      candidates.push({ id: v.id, note, vector });
    } catch {
      // unreadable thumbnail; skip
    }
  }

  // 2. Keep a diverse set, then re-embed those from the 600px photo.
  const variants: VariantView[] = [];
  for (const pick of pickDiverse(candidates)) {
    const release = await getRelease(pick.id);
    const uri = primaryImage(release?.images);
    const img = uri ? await fetchDiscogsImage(uri) : null;
    let vector = pick.vector;
    if (img) {
      try {
        vector = await embedder.embed(await toRawImage(embedder, img));
      } catch {
        // keep the thumbnail vector
      }
    }
    variants.push({
      source: "variant",
      vector,
      imageUrl: uri ?? "",
      releaseId: pick.id,
      note: pick.note,
    });
  }
  return { info, variants };
};
