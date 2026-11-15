import type { MbMediaRelease } from "./musicbrainz";

export type VinylStatus = {
  status: "yes" | "no" | "unknown";
  releases: number;
  source: "musicbrainz" | "discogs" | null;
};

export const isVinylMedium = (format?: string | null) =>
  /vinyl/i.test(format ?? "");

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

export const vinylFields = (v: VinylStatus, now = new Date()) => ({
  vinylStatus: v.status,
  vinylReleases: v.releases,
  vinylSource: v.source,
  vinylCheckedAt: now,
});
