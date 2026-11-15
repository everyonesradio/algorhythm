import {
  artistMatches,
  artistsOverlap,
  normalizeName,
  titlesMatchLoose,
} from "./musicbrainz";

const API = "https://api.discogs.com";
const userAgent = () =>
  process.env.DISCOGS_USER_AGENT ??
  "algoRhythm/0.1 +https://github.com/everyonesradio/algorhythm";

export const discogsEnabled = () => Boolean(process.env.DISCOGS_TOKEN);

// Discogs allows 60 req/min authenticated; 429s back off.
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
  title: string;
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

// Discogs suffixes same-named artists and labels with "(2)".
export const cleanArtistName = (name: string) =>
  name
    .replace(/\s*\(\d+\)$/, "")
    .replace(/\*$/, "")
    .trim();

// Discogs search is literal about punctuation: curly quotes find nothing.
export const searchText = (s: string) =>
  s
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/…/g, "...")
    .trim();

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

export const bestSearchMatch = (
  results: DgSearchResult[],
  artist: string,
  title: string
) => results.find((r) => isSameAlbum(r, artist, title)) ?? null;

const isSameAlbumForVinyl = (
  r: { title: string },
  artist: string,
  title: string
) => {
  const i = r.title.indexOf(" - ");
  if (i < 0) return false;
  const rArtist = cleanArtistName(r.title.slice(0, i));
  const rTitle = r.title.slice(i + 3);
  return titlesMatchLoose(title, rTitle) && artistsOverlap(artist, rArtist);
};

export const countOfficialVinyl = (
  results: (DgSearchResult & { format?: string[] })[],
  artist: string,
  title: string
) =>
  results.filter(
    (r) =>
      !(r.format ?? []).includes("Unofficial Release") &&
      isSameAlbumForVinyl(r, artist, title)
  ).length;

const vinylArtistQueries = (artist: string) => {
  const full = searchText(artist);
  const parts = artist
    .split(/\s*(?:&|,|\band\b|\bx\b|\bfeat\.?|\bft\.?|\bwith\b)\s*/i)
    .map(searchText)
    .filter((p) => p.length > 1);
  return [...new Set([full, ...parts])];
};

export const discogsOfficialVinyl = async (artist: string, title: string) => {
  if (!discogsEnabled()) return null;
  try {
    const t = searchText(title);
    const seen = new Set<number>();
    let total = 0;

    const absorb = (
      results: (DgSearchResult & { format?: string[] })[] | undefined
    ) => {
      for (const r of results ?? []) {
        if (seen.has(r.id)) continue;
        if (
          (r.format ?? []).includes("Unofficial Release") ||
          !isSameAlbumForVinyl(r, artist, title)
        ) {
          continue;
        }
        seen.add(r.id);
        total += 1;
      }
    };

    for (const a of vinylArtistQueries(artist)) {
      const res = await dgGet<{
        results: (DgSearchResult & { format?: string[] })[];
      }>("/database/search", {
        artist: a,
        release_title: t,
        format: "Vinyl",
        type: "release",
        per_page: "100",
      });
      absorb(res?.results);
      if (total > 0) return total;
    }

    const res = await dgGet<{
      results: (DgSearchResult & { format?: string[] })[];
    }>("/database/search", {
      q: t,
      format: "Vinyl",
      type: "release",
      per_page: "100",
    });
    absorb(res?.results);
    return total;
  } catch {
    return null;
  }
};

export const findDiscogsAlbum = async (artist: string, title: string) => {
  const a = searchText(artist);
  const t = searchText(title);
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

// Discogs image CDN isn't rate-limited, so skip the throttle.
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
