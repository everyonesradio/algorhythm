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
  /** Image the vector was made from (a pressing's cover, Spotify art...). */
  imageUrl?: string | null;
};

export type RankedAlbum = {
  albumId: string;
  similarity: number;
  /** Number of the album's vectors that showed up in the hit list. */
  support: number;
  /** Source of the album's best-scoring vector (catalog, closeup, ...). */
  source?: string;
  /**
   * The best-scoring vector that has an image (catalog cover, a pressing,
   * the Spotify art). Augmented and close-up vectors have none, so this can
   * differ from `source`: it's the cover the scan looks most like.
   */
  image?: { url: string; source?: string; similarity: number };
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
 *
 * `candidate` was raised 0.72 -> 0.76 with multi-crop scanning: more crops
 * give unrelated images more chances to look like a "generic" minimalist
 * cover (hubness: plain/noise images scored 0.73 against Dark Side of the
 * Moon). At 0.76 every correct album was still offered on both the normal
 * and the far-away synthetic sets, and no unknown cover in the normal set
 * produced a "maybe" list.
 */
export const DEFAULT_THRESHOLDS: RankingThresholds = {
  match: 0.82,
  margin: 0.03,
  candidate: 0.76,
};

const imageOf = (hit: VectorHit, url: string) => ({
  url,
  similarity: hit.similarity,
  ...(hit.source ? { source: hit.source } : {}),
});

export const groupHitsByAlbum = (hits: VectorHit[]): RankedAlbum[] => {
  const byAlbum = new Map<string, RankedAlbum>();
  for (const hit of hits) {
    const prev = byAlbum.get(hit.albumId);
    if (!prev) {
      byAlbum.set(hit.albumId, {
        albumId: hit.albumId,
        similarity: hit.similarity,
        support: 1,
        ...(hit.source ? { source: hit.source } : {}),
        ...(hit.imageUrl ? { image: imageOf(hit, hit.imageUrl) } : {}),
      });
    } else {
      prev.support += 1;
      if (hit.similarity > prev.similarity) {
        prev.similarity = hit.similarity;
        if (hit.source) prev.source = hit.source;
      }
      if (
        hit.imageUrl &&
        hit.similarity > (prev.image?.similarity ?? -Infinity)
      ) {
        prev.image = imageOf(hit, hit.imageUrl);
      }
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

const STATUS_RANK: Record<MatchStatus, number> = {
  matched: 2,
  ambiguous: 1,
  none: 0,
};

/**
 * Several crops of the same frame (or photo) are searched; keep the most
 * useful one. A confident match beats an ambiguous one beats nothing; ties
 * go to the higher top similarity. Returns the index of the winning view.
 */
export const pickBestView = (
  views: { status: MatchStatus; candidates: RankedAlbum[] }[]
): number => {
  let best = 0;
  for (let i = 1; i < views.length; i++) {
    const a = views[i];
    const b = views[best];
    const byStatus = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    const bySim =
      (a.candidates[0]?.similarity ?? -1) - (b.candidates[0]?.similarity ?? -1);
    if (byStatus > 0 || (byStatus === 0 && bySim > 0)) best = i;
  }
  return best;
};
