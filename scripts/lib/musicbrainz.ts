/**
 * Minimal MusicBrainz + Cover Art Archive client for catalog seeding.
 *
 * MusicBrainz asks for <= 1 request/second and a descriptive User-Agent:
 * https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting
 */

const MB_API = "https://musicbrainz.org/ws/2";
const CAA_API = "https://coverartarchive.org";

const USER_AGENT =
  process.env.MUSICBRAINZ_USER_AGENT ??
  "algoRhythm/0.1 ( https://github.com/everyonesradio/algorhythm )";

let lastRequest = 0;
const throttle = async (minGapMs = 1100) => {
  const wait = lastRequest + minGapMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
};

const mbGet = async <T>(path: string, params: Record<string, string>) => {
  const url = new URL(`${MB_API}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("fmt", "json");

  for (let attempt = 0; attempt < 4; attempt++) {
    await throttle();
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (res.status === 503 || res.status === 429) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`MusicBrainz ${res.status} for ${url}`);
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
  releaseYear: number | null;
  primaryType: string | null;
  genres: string[];
  tags: string[];
};

const artistName = (credits?: MbArtistCredit[]) =>
  (credits ?? []).map((c) => `${c.name}${c.joinphrase ?? ""}`).join("").trim();

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
    releaseYear: Number.isFinite(year) ? year : null,
    primaryType: rg["primary-type"] ?? null,
    genres: topNames(rg.genres),
    tags: topNames(rg.tags),
  };
};

/** Lucene-escape a value for the MusicBrainz search syntax. */
const q = (v: string) => `"${v.replace(/(["\\])/g, "\\$1")}"`;

/** Search release groups with a raw Lucene query, paging until `limit`. */
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

export const findReleaseGroup = async (artist: string, album: string) => {
  const results = await searchReleaseGroups(
    `releasegroup:${q(album)} AND artist:${q(artist)}`,
    5
  );
  // MB returns a relevance score 0-100; anything below ~85 is usually wrong.
  return results.find((r) => (r.score ?? 0) >= 85) ?? null;
};

export const releaseGroupsForArtist = (artist: string, limit: number) =>
  searchReleaseGroups(
    `artist:${q(artist)} AND (primarytype:album OR primarytype:ep)`,
    limit
  );

export const releaseGroupsForTag = (tag: string, limit: number) =>
  searchReleaseGroups(
    `tag:${q(tag)} AND (primarytype:album OR primarytype:ep)`,
    limit
  );

/** Full lookup, adds curated genres and tags (search results lack genres). */
export const lookupReleaseGroup = (mbid: string) =>
  mbGet<MbReleaseGroup>(`release-group/${mbid}`, {
    inc: "artist-credits+genres+tags",
  });

/**
 * Front cover for a release group. CAA picks a representative release.
 * Sizes: 250 | 500 | 1200. 500 is plenty for a 224px model input.
 */
export const coverArtUrl = (mbid: string, size: 250 | 500 | 1200 = 500) =>
  `${CAA_API}/release-group/${mbid}/front-${size}`;

export const fetchImage = async (url: string): Promise<Buffer | null> => {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    redirect: "follow",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Image ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
};
