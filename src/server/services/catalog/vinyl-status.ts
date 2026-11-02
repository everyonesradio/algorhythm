import type { MbMediaRelease } from "./musicbrainz";

/**
 * Was an album pressed on vinyl? Decides what the catalog spends vectors
 * on: albums people can actually hold, not every mixtape, single and
 * digital-only EP an artist has.
 *
 *   1. MusicBrainz: official releases of the album with a vinyl medium.
 *      Free with the discography lookup, but incomplete (it lists no vinyl
 *      for Jorja Smith's "Lost & Found"; Discogs has 4 official pressings).
 *   2. Discogs: official vinyl releases, only for albums MusicBrainz shows
 *      without vinyl. Bootlegs don't count.
 *
 * "unknown" means neither source could answer (Discogs down or no token):
 * not ingested now, checked again on the next run.
 */

export type VinylStatus = {
  status: "yes" | "no" | "unknown";
  /** Official vinyl releases found by `source`. */
  releases: number;
  source: "musicbrainz" | "discogs" | null;
};

/** "12\" Vinyl", "7\" Vinyl", "Vinyl"... */
export const isVinylMedium = (format?: string | null) =>
  /vinyl/i.test(format ?? "");

/** Official vinyl releases per release group (0 when it has none). */
export const vinylReleasesByGroup = (releases: MbMediaRelease[]) => {
  const counts = new Map<string, number>();
  for (const r of releases) {
    const rg = r["release-group"]?.id;
    if (!rg) continue;
    const vinyl = (r.media ?? []).some((m) => isVinylMedium(m.format));
    counts.set(rg, (counts.get(rg) ?? 0) + (vinyl ? 1 : 0));
  }
  return counts;
};

/**
 * Combine the two sources. `discogs` is only consulted when MusicBrainz
 * has no vinyl; it returns null when it can't answer.
 */
export const decideVinyl = async (
  mbVinylReleases: number,
  discogs: () => Promise<number | null>
): Promise<VinylStatus> => {
  if (mbVinylReleases > 0) {
    return { status: "yes", releases: mbVinylReleases, source: "musicbrainz" };
  }
  const n = await discogs().catch(() => null);
  if (n === null) return { status: "unknown", releases: 0, source: null };
  return n > 0
    ? { status: "yes", releases: n, source: "discogs" }
    : { status: "no", releases: 0, source: "discogs" };
};

/** Album fields to store a status on. */
export const vinylFields = (v: VinylStatus, now = new Date()) => ({
  vinylStatus: v.status,
  vinylReleases: v.releases,
  vinylSource: v.source,
  vinylCheckedAt: now,
});
