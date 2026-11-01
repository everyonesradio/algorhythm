/**
 * "Is it by one of these artists?" When a scan isn't a confident album
 * match, the nearest covers often still include the right artist: visual
 * style carries over between an artist's records. Measured on unseen covers
 * (29-album catalog), the right artist was in the top 3 distinct artists
 * every time, but only sometimes first and at low similarity (~0.64-0.70),
 * so we offer a few artists for the user to choose instead of one guess.
 */

export type ArtistHit = {
  similarity: number;
  artist: string;
  artistMbid: string | null;
};

export type ArtistSuggestion = {
  name: string;
  mbid: string;
  similarity: number;
};

export const ARTIST_SUGGEST = {
  /** Albums below this aren't evidence of anything. */
  floor: 0.6,
  /** How many nearest albums to look through, deduped by artist first. */
  window: 40,
  /** How many distinct artists to offer. */
  max: 3,
};

/** Distinct artists among the nearest albums, best first. */
export const suggestArtists = (
  hits: ArtistHit[],
  cfg = ARTIST_SUGGEST
): ArtistSuggestion[] => {
  const near = [...hits]
    .filter((h) => h.artistMbid && h.similarity >= cfg.floor)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, cfg.window);

  const seen = new Map<string, ArtistSuggestion>();
  for (const h of near) {
    if (!seen.has(h.artistMbid!)) {
      seen.set(h.artistMbid!, {
        name: h.artist,
        mbid: h.artistMbid!,
        similarity: h.similarity,
      });
    }
  }
  return [...seen.values()].slice(0, cfg.max);
};
