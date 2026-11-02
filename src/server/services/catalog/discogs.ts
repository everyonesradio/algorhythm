/**
 * Discogs API client: vinyl pressings, alternative covers, label & style.
 *
 * Discogs tracks every pressing of a record with photos of the actual sleeve,
 * which is what we need for alternative covers (e.g. the 2024 reissue art of
 * MM..FOOD) and for albums MusicBrainz doesn't have.
 *
 * Auth: personal access token (DISCOGS_TOKEN). Rate limit: 60 requests/min
 * authenticated, so requests are spaced ~1.05s apart and 429s back off.
 * Image files (i.discogs.com) are a CDN and don't count against the limit.
 * Data from Discogs needs attribution in the UI ("Data provided by Discogs").
 */
import { artistMatches, normalizeName } from "./musicbrainz";

const API = "https://api.discogs.com";
const userAgent = () =>
  process.env.DISCOGS_USER_AGENT ??
  "algoRhythm/0.1 +https://github.com/everyonesradio/algorhythm";

export const discogsEnabled = () => Boolean(process.env.DISCOGS_TOKEN);

let lastRequest = 0;
const throttle = async (gapMs = 1050) => {
  const wait = lastRequest + gapMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
};

const dgGet = async <T>(path: string, params: Record<string, string> = {}) => {
  const url = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  for (let attempt = 0; attempt < 4; attempt++) {
    await throttle();
    const res = await fetch(url, {
      headers: {
        "User-Agent": userAgent(),
        Authorization: `Discogs token=${process.env.DISCOGS_TOKEN}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
      continue;
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Discogs ${res.status} for ${url.pathname}`);
    return (await res.json()) as T;
  }
  throw new Error(`Discogs rate-limited for ${url.pathname}`);
};

type DgSearchResult = {
  id: number;
  type: "master" | "release";
  title: string; // "Artist - Title"
  year?: string;
  cover_image?: string;
  master_id?: number;
};

export type DgVersion = {
  id: number;
  title: string;
  released?: string;
  country?: string;
  label?: string;
  format?: string;
  thumb?: string;
};

type DgImage = {
  type: "primary" | "secondary";
  uri: string;
  width: number;
  height: number;
};

export type DgRelease = {
  id: number;
  title: string;
  year?: number;
  master_id?: number;
  artists: { name: string; id: number }[];
  labels?: { name: string }[];
  genres?: string[];
  styles?: string[];
  images?: DgImage[];
};

export type DgMaster = {
  id: number;
  title: string;
  year?: number;
  main_release: number;
  artists: { name: string; id: number }[];
  genres?: string[];
  styles?: string[];
  images?: DgImage[];
};

/** "MF Doom (2)" -> "MF Doom": Discogs numbers same-named artists & labels. */
export const cleanArtistName = (name: string) =>
  name
    .replace(/\s*\(\d+\)$/, "")
    .replace(/\*$/, "")
    .trim();

/**
 * Discogs search is literal about punctuation: "D’Angelo" (curly, as
 * MusicBrainz writes it) finds nothing, "D'Angelo" finds Voodoo.
 */
export const searchText = (s: string) =>
  s
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/…/g, "...")
    .trim();

/** Does a search result's "Artist - Title" fit the album asked for? */
const isSameAlbum = (r: { title: string }, artist: string, title: string) => {
  const i = r.title.indexOf(" - ");
  if (i < 0) return false;
  const rArtist = cleanArtistName(r.title.slice(0, i));
  const rTitle = r.title.slice(i + 3);
  return (
    normalizeName(rTitle) === normalizeName(title) &&
    artistMatches(artist, rArtist)
  );
};

/** Pick the search result whose "Artist - Title" fits what we asked for. */
export const bestSearchMatch = (
  results: DgSearchResult[],
  artist: string,
  title: string
) => results.find((r) => isSameAlbum(r, artist, title)) ?? null;

/**
 * Official vinyl releases of an album on Discogs. Bootlegs are flagged
 * "Unofficial Release" in the format and don't count: every vinyl listing
 * of Kendrick's "Section.80" and SZA's "Z" is one.
 */
export const countOfficialVinyl = (
  results: (DgSearchResult & { format?: string[] })[],
  artist: string,
  title: string
) =>
  results.filter(
    (r) =>
      !(r.format ?? []).includes("Unofficial Release") &&
      isSameAlbum(r, artist, title)
  ).length;

/** Null when Discogs can't answer (no token, outage). */
export const discogsOfficialVinyl = async (artist: string, title: string) => {
  if (!discogsEnabled()) return null;
  try {
    const res = await dgGet<{
      results: (DgSearchResult & { format?: string[] })[];
    }>("/database/search", {
      artist: searchText(artist),
      release_title: searchText(title),
      format: "Vinyl",
      type: "release",
      per_page: "100",
    });
    return res ? countOfficialVinyl(res.results, artist, title) : 0;
  } catch {
    return null;
  }
};

/**
 * Find the Discogs master (all pressings of an album) for artist + title,
 * falling back to a single release when no master exists.
 */
export const findDiscogsAlbum = async (artist: string, title: string) => {
  const a = searchText(artist);
  const t = searchText(title);
  // Precise field search first, then a keyword search as a fallback.
  const attempts: Record<string, string>[] = [
    { type: "master", artist: a, release_title: t },
    { type: "release", artist: a, release_title: t },
    { type: "master", q: `${a} ${t}` },
  ];
  for (const params of attempts) {
    const res = await dgGet<{ results: DgSearchResult[] }>("/database/search", {
      ...params,
      per_page: "10",
    });
    const hit = res ? bestSearchMatch(res.results, artist, title) : null;
    if (hit) return { type: params.type as "master" | "release", id: hit.id };
  }
  return null;
};

export const getMaster = (id: number) => dgGet<DgMaster>(`/masters/${id}`);
export const getRelease = (id: number) => dgGet<DgRelease>(`/releases/${id}`);

/** Vinyl pressings of a master, oldest first. */
export const vinylVersions = async (masterId: number, limit = 50) => {
  const res = await dgGet<{ versions: DgVersion[] }>(
    `/masters/${masterId}/versions`,
    {
      format: "Vinyl",
      per_page: String(Math.min(limit, 100)),
      sort: "released",
      sort_order: "asc",
    }
  );
  return res?.versions ?? [];
};

export const primaryImage = (images?: DgImage[]) =>
  images?.find((i) => i.type === "primary")?.uri ?? images?.[0]?.uri ?? null;

/** Download a Discogs image (CDN, not rate-limited). */
export const fetchDiscogsImage = async (
  url: string
): Promise<Buffer | null> => {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": userAgent() },
      signal: AbortSignal.timeout(20_000),
    });
    return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
  } catch {
    return null;
  }
};
