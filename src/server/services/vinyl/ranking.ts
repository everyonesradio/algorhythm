/**
 * Turns raw nearest-neighbour hits into a decision the UI can act on.
 *
 * Hits are per-embedding (an album can have many vectors), so we first keep
 * each album's best score, then decide:
 *   matched   - top score is high AND clearly ahead of the runner-up
 *   ambiguous - something plausible, let the user pick from candidates
 *   none      - nothing close, keep scanning
 *
 * Thresholds are cosine similarities. They're starting points for CLIP
 * ViT-B/32; calibrate with `npm run vinyl:eval` on real phone photos.
 */

export type VectorHit = {
  albumId: string;
  /** Cosine similarity in [-1, 1]. */
  similarity: number;
  source?: string;
};

export type RankedAlbum = {
  albumId: string;
  similarity: number;
  /** Number of the album's vectors that showed up in the hit list. */
  support: number;
};

export type MatchStatus = "matched" | "ambiguous" | "none";

export type RankingThresholds = {
  match: number;
  margin: number;
  candidate: number;
};

/**
 * Calibrated with `npm run vinyl:eval` (CLIP ViT-B/32, 29 albums seeded with
 * --augment, 58 synthetic phone shots + 15 covers not in the index):
 *   correct top hit   min 0.763, p10 0.796, p50 0.881
 *   incorrect top hit max 0.707, p90 0.683
 * `match` keeps a ~0.11 buffer over the worst wrong hit because wrong scores
 * creep up as the catalog grows (more look-alike covers). Re-calibrate on
 * real phone photos and a larger catalog.
 */
export const DEFAULT_THRESHOLDS: RankingThresholds = {
  match: 0.82,
  margin: 0.03,
  candidate: 0.72,
};

export const groupHitsByAlbum = (hits: VectorHit[]): RankedAlbum[] => {
  const byAlbum = new Map<string, RankedAlbum>();
  for (const hit of hits) {
    const prev = byAlbum.get(hit.albumId);
    if (!prev) {
      byAlbum.set(hit.albumId, {
        albumId: hit.albumId,
        similarity: hit.similarity,
        support: 1,
      });
    } else {
      prev.support += 1;
      if (hit.similarity > prev.similarity) prev.similarity = hit.similarity;
    }
  }
  return [...byAlbum.values()].sort((a, b) => b.similarity - a.similarity);
};

export const decideMatch = (
  ranked: RankedAlbum[],
  thresholds: RankingThresholds = DEFAULT_THRESHOLDS
): MatchStatus => {
  const [top, second] = ranked;
  if (!top || top.similarity < thresholds.candidate) return "none";

  const margin = top.similarity - (second?.similarity ?? -1);
  if (top.similarity >= thresholds.match && margin >= thresholds.margin) {
    return "matched";
  }
  return "ambiguous";
};

export const rankHits = (
  hits: VectorHit[],
  limit = 5,
  thresholds: RankingThresholds = DEFAULT_THRESHOLDS
) => {
  const ranked = groupHitsByAlbum(hits);
  const status = decideMatch(ranked, thresholds);
  const candidates = ranked
    .filter((r) => r.similarity >= thresholds.candidate)
    .slice(0, limit);
  return { status, candidates };
};
