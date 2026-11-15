const MB_API = "https://musicbrainz.org/ws/2";
const CAA_API = "https://coverartarchive.org";

// MusicBrainz requires a descriptive User-Agent.
const USER_AGENT =
  process.env.MUSICBRAINZ_USER_AGENT ??
  "algoRhythm/0.1 ( https://github.com/everyonesradio/algorhythm )";

import { createLanes } from "./rate-lanes";

// MusicBrainz allows 1 req/s; stay under it and back off after a 429.
const MIN_GAP_MS = 1200;
const lanes = createLanes(MIN_GAP_MS);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const mbGet = async <T>(path: string, params: Record<string, string>) => {
  const url = new URL(`${MB_API}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("fmt", "json");

  for (let attempt = 0; attempt < 8; attempt++) {
    await lanes.acquire();
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 503 || res.status === 429) {
      const retryAfter = Number.parseInt(
        res.headers.get("retry-after") ?? "",
        10
      );
      const backoffMs = Number.isFinite(retryAfter)
        ? retryAfter * 1000
        : Math.min(60_000, 3000 * 2 ** attempt);
      lanes.setGap(Math.min(3000, lanes.gap() + 200));
      await sleep(backoffMs);
      continue;
    }
    if (!res.ok) throw new Error(`MusicBrainz ${res.status} for ${url}`);
    lanes.setGap(Math.max(MIN_GAP_MS, lanes.gap() - 100));
    return (await res.json()) as T;
  }
  throw new Error(`MusicBrainz rate-limited for ${url}`);
};

type MbArtistCredit = {
  name: string;
  joinphrase?: string;
  artist: { id: string; name: string };
};

type MbTag = { name: string; count: number };

export type MbReleaseGroup = {
  id: string;
  title: string;
  "primary-type"?: string;
  "secondary-types"?: string[];
  "first-release-date"?: string;
  "artist-credit"?: MbArtistCredit[];
  tags?: MbTag[];
  genres?: MbTag[];
  score?: number;
};

export type CatalogAlbum = {
  mbid: string;
  title: string;
  artist: string;
  artistMbid: string | null;
  artistName: string | null;
  releaseYear: number | null;
  primaryType: string | null;
  genres: string[];
  tags: string[];
};

const artistName = (credits?: MbArtistCredit[]) =>
  (credits ?? [])
    .map((c) => `${c.name}${c.joinphrase ?? ""}`)
    .join("")
    .trim();

const topNames = (items?: MbTag[], n = 8) =>
  (items ?? [])
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, n)
    .map((t) => t.name);

export const toCatalogAlbum = (rg: MbReleaseGroup): CatalogAlbum => {
  const year = Number.parseInt(rg["first-release-date"]?.slice(0, 4) ?? "", 10);
  return {
    mbid: rg.id,
    title: rg.title,
    artist: artistName(rg["artist-credit"]),
    artistMbid: rg["artist-credit"]?.[0]?.artist.id ?? null,
    artistName: rg["artist-credit"]?.[0]?.artist.name ?? null,
    releaseYear: Number.isFinite(year) ? year : null,
    primaryType: rg["primary-type"] ?? null,
    genres: topNames(rg.genres),
    tags: topNames(rg.tags),
  };
};

const q = (v: string) => `"${v.replace(/(["\\])/g, "\\$1")}"`;

export const searchReleaseGroups = async (query: string, limit: number) => {
  const out: MbReleaseGroup[] = [];
  let offset = 0;
  while (out.length < limit) {
    const page = Math.min(100, limit - out.length);
    const res = await mbGet<{
      count: number;
      "release-groups": MbReleaseGroup[];
    }>("release-group", { query, limit: String(page), offset: String(offset) });
    out.push(...res["release-groups"]);
    offset += page;
    if (offset >= res.count || res["release-groups"].length === 0) break;
  }
  return out;
};

export const normalizeName = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    // Discogs titles sometimes embed zero-width spaces.
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[’'`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the /, "");

export const titlesMatchLoose = (wanted: string, candidate: string) => {
  const a = normalizeName(wanted);
  const b = normalizeName(candidate);
  if (!a || !b) return false;
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return shorter.length >= 10 && longer.includes(shorter);
};

export const artistsOverlap = (wanted: string, credit: string) => {
  const c = normalizeName(credit);
  const w = normalizeName(wanted);
  if (!c || !w) return false;
  if (c === w || w.includes(c) || c.includes(w)) return true;
  const wantedParts = splitArtists(wanted);
  const creditParts = splitArtists(credit);
  return wantedParts.some(
    (p) =>
      c.includes(p) ||
      creditParts.some((cp) => cp === p || cp.includes(p) || p.includes(cp))
  );
};

export const splitArtists = (s: string) =>
  s
    .split(/\s*(?:&|,|\band\b|\bx\b|\bfeat\.?|\bft\.?|\bwith\b)\s*/i)
    .map(normalizeName)
    .filter((p) => p.length > 1);

export const artistMatches = (wanted: string, credit: string) => {
  const c = normalizeName(credit);
  const parts = splitArtists(wanted);
  if (parts.length === 0) return false;
  return parts.every((p) => c.includes(p));
};

const creditOf = (rg: MbReleaseGroup) => artistName(rg["artist-credit"]);

export const findReleaseGroup = async (artist: string, album: string) => {
  const results = await searchReleaseGroups(
    `releasegroup:${q(album)} AND artist:${q(artist)}`,
    5
  );
  const exact = results.find((r) => (r.score ?? 0) >= 85);
  if (exact) return exact;

  const byTitle = await searchReleaseGroups(`releasegroup:${q(album)}`, 15);
  const wantedTitle = normalizeName(album);
  return (
    byTitle.find(
      (r) =>
        (r.score ?? 0) >= 85 &&
        normalizeName(r.title) === wantedTitle &&
        artistMatches(artist, creditOf(r))
    ) ?? null
  );
};

export const releaseGroupsForTag = (tag: string, limit: number) =>
  searchReleaseGroups(
    `tag:${q(tag)} AND (primarytype:album OR primarytype:ep)`,
    limit
  );

// Search results lack genres; the full lookup has them.
export const lookupReleaseGroup = (mbid: string) =>
  mbGet<MbReleaseGroup>(`release-group/${mbid}`, {
    inc: "artist-credits+genres+tags",
  });

export const coverArtUrl = (mbid: string, size: 250 | 500 | 1200 = 500) =>
  `${CAA_API}/release-group/${mbid}/front-${size}`;

// archive.org intermittently 5xxs on files that exist, so retry.
export const fetchImage = async (
  url: string,
  attempts = 5
): Promise<Buffer | null> => {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
    }
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        redirect: "follow",
        signal: AbortSignal.timeout(30_000),
      });
      if (res.status === 404) return null;
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      lastError = new Error(`Image ${res.status} for ${url}`);
      if (res.status < 500 && res.status !== 429) break;
    } catch (err) {
      lastError = err as Error;
    }
  }
  throw lastError ?? new Error(`Image fetch failed for ${url}`);
};

// Each size is a separate archive.org file; one may fail while another works.
export const fetchCover = async (
  mbid: string
): Promise<{ url: string; image: Buffer } | null> => {
  let lastError: Error | null = null;
  for (const size of [500, 1200, 250] as const) {
    const url = coverArtUrl(mbid, size);
    try {
      const image = await fetchImage(url, 3);
      if (!image) return null;
      return { url, image };
    } catch (err) {
      lastError = err as Error;
    }
  }
  throw lastError ?? new Error(`No cover for ${mbid}`);
};

const SKIP_SECONDARY = new Set([
  "Live",
  "Compilation",
  "Remix",
  "DJ-mix",
  "Demo",
  "Interview",
  "Audiobook",
  "Spokenword",
  "Audio drama",
]);

export const discographyForArtist = async (artistMbid: string, limit = 60) => {
  const out: MbReleaseGroup[] = [];
  let offset = 0;
  while (out.length < limit) {
    const res = await mbGet<{
      "release-group-count": number;
      "release-groups": MbReleaseGroup[];
    }>("release-group", {
      artist: artistMbid,
      type: "album|ep",
      limit: "100",
      offset: String(offset),
    });
    out.push(...res["release-groups"]);
    offset += res["release-groups"].length;
    if (
      offset >= res["release-group-count"] ||
      res["release-groups"].length === 0
    ) {
      break;
    }
  }
  return out
    .filter(
      (rg) => !(rg["secondary-types"] ?? []).some((t) => SKIP_SECONDARY.has(t))
    )
    .sort((a, b) =>
      (b["first-release-date"] ?? "").localeCompare(
        a["first-release-date"] ?? ""
      )
    )
    .slice(0, limit);
};

type MbArtist = {
  id: string;
  name: string;
  disambiguation?: string;
  country?: string;
  score?: number;
};

export const pickArtist = <T extends { name: string }>(
  name: string,
  results: T[]
) =>
  results.find((a) => normalizeName(a.name) === normalizeName(name)) ??
  results[0] ??
  null;

export const searchArtists = async (query: string, limit = 6) => {
  const res = await mbGet<{ artists: MbArtist[] }>("artist", {
    query: `artist:${q(query)} OR alias:${q(query)}`,
    limit: String(limit),
  });
  return res.artists
    .filter((a) => (a.score ?? 0) >= 60)
    .map((a) => ({
      mbid: a.id,
      name: a.name,
      detail: a.disambiguation || a.country || null,
    }));
};

export const coverExists = async (
  mbid: string,
  size: 250 | 500 | 1200 = 500
) => {
  const res = await fetch(coverArtUrl(mbid, size), {
    method: "HEAD",
    redirect: "manual",
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(10_000),
  });
  return res.status >= 300 && res.status < 400;
};

export type MbRelease = {
  id: string;
  title: string;
  date?: string;
  status?: string;
  barcode?: string | null;
  relations?: { type: string; url?: { resource: string } }[];
};

export const releasesWithUrls = async (releaseGroupMbid: string) =>
  (
    await mbGet<{ releases: MbRelease[] }>("release", {
      "release-group": releaseGroupMbid,
      inc: "url-rels",
      limit: "100",
    })
  ).releases;

export type MbMediaRelease = {
  id: string;
  title: string;
  status?: string;
  "release-group"?: { id: string; title: string };
  media?: { format?: string | null }[];
};

export const officialReleasesWithMedia = async (
  by: { artist: string } | { releaseGroup: string }
) => {
  const out: MbMediaRelease[] = [];
  for (let offset = 0; ;) {
    const res = await mbGet<{
      "release-count": number;
      releases: MbMediaRelease[];
    }>("release", {
      ...("artist" in by
        ? { artist: by.artist }
        : { "release-group": by.releaseGroup }),
      status: "official",
      inc: "media+release-groups",
      limit: "100",
      offset: String(offset),
    });
    out.push(...res.releases);
    offset += res.releases.length;
    if (offset >= res["release-count"] || res.releases.length === 0) return out;
  }
};

export const artistNameById = async (artistMbid: string) =>
  (await mbGet<{ name: string }>(`artist/${artistMbid}`, {})).name;

export type MbReleaseDetail = MbRelease & {
  "release-group"?: { id: string; title: string };
  "artist-credit"?: MbArtistCredit[];
};

export const releaseIdForUrl = async (url: string): Promise<string | null> => {
  const res = await mbGet<{ relations?: { release?: { id: string } }[] }>(
    "url",
    {
      resource: url,
      inc: "release-rels",
    }
  ).catch((err: Error) => {
    if (/MusicBrainz 404/.test(err.message)) return null;
    throw err;
  });
  return res?.relations?.find((r) => r.release)?.release?.id ?? null;
};

export const releaseIdForBarcode = async (
  barcode: string
): Promise<string | null> => {
  if (!/^\d{8,14}$/.test(barcode)) return null;
  const res = await mbGet<{ releases: { id: string; score?: number }[] }>(
    "release",
    {
      query: `barcode:${barcode}`,
      limit: "5",
    }
  );
  return res.releases.find((r) => (r.score ?? 0) >= 90)?.id ?? null;
};

export const releaseDetail = async (releaseId: string) => {
  const r = await mbGet<MbReleaseDetail>(`release/${releaseId}`, {
    inc: "release-groups+url-rels+artist-credits",
  });
  const rg = r["release-group"];
  if (!rg) return null;
  return {
    mbid: rg.id,
    title: rg.title,
    artist: artistName(r["artist-credit"]),
    artistName: r["artist-credit"]?.[0]?.artist.name ?? null,
    release: r as MbRelease,
  };
};

const wikidataOf = (
  relations?: { type: string; url?: { resource: string } }[]
) =>
  relations
    ?.find((r) => r.type === "wikidata")
    ?.url?.resource.match(/(Q\d+)$/)?.[1] ?? null;

export const releaseGroupLinks = async (releaseGroupMbid: string) => {
  const res = await mbGet<{
    relations?: { type: string; url?: { resource: string } }[];
  }>(`release-group/${releaseGroupMbid}`, { inc: "url-rels" });
  return {
    wikidata: wikidataOf(res.relations),
    reviews: (res.relations ?? [])
      .filter((r) => r.type === "review" && r.url)
      .map((r) => r.url!.resource),
  };
};

export const artistWikidata = async (artistMbid: string) =>
  wikidataOf(
    (
      await mbGet<{
        relations?: { type: string; url?: { resource: string } }[];
      }>(`artist/${artistMbid}`, { inc: "url-rels" })
    ).relations
  );

export type MbTrackRelease = {
  id: string;
  title: string;
  date?: string;
  status?: string;
  media?: {
    format?: string | null;
    position?: number;
    tracks?: { number: string; title: string; length?: number | null }[];
  }[];
};

export const releasesWithTracks = async (releaseGroupMbid: string) =>
  (
    await mbGet<{ releases: MbTrackRelease[] }>("release", {
      "release-group": releaseGroupMbid,
      status: "official",
      inc: "recordings+media",
      limit: "25",
    })
  ).releases;
