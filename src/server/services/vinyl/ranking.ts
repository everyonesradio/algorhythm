export type VectorHit = {
  albumId: string;
  similarity: number;
  source?: string;
};

export type RankedAlbum = {
  albumId: string;
  similarity: number;
  support: number;
  source?: string;
};

export type MatchStatus = "matched" | "ambiguous" | "none";

export type RankingThresholds = {
  match: number;
  margin: number;
  candidate: number;
};

// Calibrated with `npm run vinyl:eval` (see docs/VINYL_RECOGNITION.md).
export const DEFAULT_THRESHOLDS: RankingThresholds = {
  match: 0.82,
  margin: 0.03,
  candidate: 0.76,
};

// Camera photos ("user_scan") also capture the desk and hand, so other records
// held there can look like them: cap the lift, and never match on them alone.
export const CAMERA_LIFT = 0.07;
export const CAMERA_ONLY_MAX = DEFAULT_THRESHOLDS.match - 0.01;
const CAMERA_SOURCE = "user_scan";

export const groupHitsByAlbum = (hits: VectorHit[]): RankedAlbum[] => {
  const byAlbum = new Map<
    string,
    RankedAlbum & { cover: number; camera: number }
  >();
  for (const hit of hits) {
    let album = byAlbum.get(hit.albumId);
    if (!album) {
      album = {
        albumId: hit.albumId,
        similarity: -Infinity,
        support: 0,
        cover: -Infinity,
        camera: -Infinity,
      };
      byAlbum.set(hit.albumId, album);
    }
    album.support += 1;
    if (hit.source === CAMERA_SOURCE) {
      album.camera = Math.max(album.camera, hit.similarity);
    } else {
      album.cover = Math.max(album.cover, hit.similarity);
    }
    if (hit.similarity > album.similarity) {
      album.similarity = hit.similarity;
      if (hit.source) album.source = hit.source;
    }
  }
  return [...byAlbum.values()]
    .map(({ cover, camera, ...album }) => ({
      ...album,
      similarity:
        cover === -Infinity
          ? Math.min(camera, CAMERA_ONLY_MAX)
          : Math.max(cover, Math.min(camera, cover + CAMERA_LIFT)),
    }))
    .sort((a, b) => b.similarity - a.similarity);
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
