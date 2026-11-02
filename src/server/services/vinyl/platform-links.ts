import { Adapter } from "@/config/enum";
import {
  type MbRelease,
  normalizeName,
  splitArtists,
} from "@/server/services/catalog/musicbrainz";

/**
 * Exact streaming links for an album, from sources that identify the
 * release rather than guess it from a text search:
 *
 *   1. MusicBrainz URL relationships: links editors attached to the release.
 *   2. Barcode (UPC) lookups: Apple's and Deezer's catalogs are keyed by it.
 *   3. Strict search: Apple/Deezer JSON search, accepted only when artist
 *      and title both match after normalising.
 *
 * Text-search scraping (services/search.ts) used to pick the best of a
 * platform's first few results, which linked MIKE's "Showbiz!" to the wrong
 * album on Apple Music.
 */

/** "source": the link the user pasted (links router). */
export type LinkSource =
  "musicbrainz" | "barcode" | "search" | "spotify" | "source";
export type AlbumLink = { type: Adapter; url: string; via: LinkSource };

/** Platform + canonical URL for a streaming link, or null. */
export const platformOf = (
  raw: string
): { type: Adapter; url: string } | null => {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");
  const path = u.pathname;
  if (host === "open.spotify.com" && /^\/album\//.test(path)) {
    return { type: Adapter.Spotify, url: `https://open.spotify.com${path}` };
  }
  if (host === "music.apple.com" || host === "itunes.apple.com") {
    // Drop the storefront ("/gb/") so Apple opens the listener's own store.
    const id = path.match(/\/album\/(?:[^/]+\/)?(?:id)?(\d+)$/)?.[1];
    return id
      ? { type: Adapter.AppleMusic, url: `https://music.apple.com/album/${id}` }
      : null;
  }
  if (host === "deezer.com") {
    const id = path.match(/\/album\/(\d+)/)?.[1];
    return id
      ? { type: Adapter.Deezer, url: `https://www.deezer.com/album/${id}` }
      : null;
  }
  if (host === "tidal.com" || host === "listen.tidal.com") {
    const id = path.match(/\/album\/(\d+)/)?.[1];
    return id
      ? { type: Adapter.Tidal, url: `https://tidal.com/album/${id}` }
      : null;
  }
  if (host === "music.youtube.com" && /^\/(playlist|browse)/.test(path)) {
    return { type: Adapter.YouTube, url: u.toString() };
  }
  if (host === "soundcloud.com" && /\/sets\//.test(path)) {
    return { type: Adapter.SoundCloud, url: `https://soundcloud.com${path}` };
  }
  return null;
};

/**
 * Most representative releases first: same title as the album (not the
 * deluxe), official, earliest. Links and barcodes are taken in this order.
 */
export const rankReleases = (releases: MbRelease[], albumTitle: string) => {
  const title = normalizeName(albumTitle);
  const score = (r: MbRelease) =>
    (normalizeName(r.title) === title ? 2 : 0) +
    (r.status === "Official" ? 1 : 0);
  return [...releases].sort(
    (a, b) =>
      score(b) - score(a) || (a.date || "9999").localeCompare(b.date || "9999")
  );
};

export const linksFromReleases = (
  releases: MbRelease[],
  albumTitle: string
) => {
  const links = new Map<Adapter, AlbumLink>();
  const barcodes: string[] = [];
  for (const r of rankReleases(releases, albumTitle)) {
    if (r.barcode && /^\d{8,14}$/.test(r.barcode)) barcodes.push(r.barcode);
    for (const rel of r.relations ?? []) {
      const p = rel.url ? platformOf(rel.url.resource) : null;
      if (p && !links.has(p.type))
        links.set(p.type, { ...p, via: "musicbrainz" });
    }
  }
  return { links, barcodes: [...new Set(barcodes)] };
};

const getJson = async <T>(url: string): Promise<T | null> => {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
};

type ItunesAlbum = {
  collectionId: number;
  collectionName: string;
  artistName: string;
};
type DeezerAlbum = {
  id: number;
  title: string;
  artist?: { name: string };
  error?: unknown;
};

/**
 * Same artist, by whole names: "MIKE" matches "MIKE" and "MIKE & DJ Blackpower",
 * not "Mike Posner" (substring matching is how wrong links got through).
 */
export const sameArtist = (wanted: string, found: string) => {
  if (normalizeName(wanted) === normalizeName(found)) return true;
  const have = new Set(splitArtists(found));
  const want = splitArtists(wanted);
  return want.length > 0 && want.every((p) => have.has(p));
};

const EDITION =
  /\s*[([][^)\]]*(edition|version|remaster|deluxe|explicit)[^)\]]*[)\]]/gi;

/**
 * Same album? Artist must match (collaborations in any order) and the
 * title must be equal after normalising ("Showbiz!" == "Showbiz"), ignoring
 * an "(Explicit)" / "(Deluxe Edition)" suffix only as a second choice.
 */
export const pickSameAlbum = <T>(
  wanted: { artist: string; title: string },
  results: T[],
  read: (r: T) => { artist: string; title: string }
): T | undefined => {
  const byArtist = results.filter((r) =>
    sameArtist(wanted.artist, read(r).artist)
  );
  const title = normalizeName(wanted.title);
  const loose = (t: string) => normalizeName(t.replace(EDITION, ""));
  return (
    byArtist.find((r) => normalizeName(read(r).title) === title) ??
    byArtist.find((r) => loose(read(r).title) === loose(wanted.title))
  );
};

export const appleByBarcode = async (
  upc: string
): Promise<AlbumLink | null> => {
  const res = await getJson<{ results: ItunesAlbum[] }>(
    `https://itunes.apple.com/lookup?upc=${upc}&entity=album`
  );
  const album = res?.results.find((r) => r.collectionId);
  return album
    ? {
        type: Adapter.AppleMusic,
        url: `https://music.apple.com/album/${album.collectionId}`,
        via: "barcode",
      }
    : null;
};

export const deezerByBarcode = async (
  upc: string
): Promise<AlbumLink | null> => {
  const res = await getJson<DeezerAlbum>(
    `https://api.deezer.com/album/upc:${upc}`
  );
  return res?.id && !res.error
    ? {
        type: Adapter.Deezer,
        url: `https://www.deezer.com/album/${res.id}`,
        via: "barcode",
      }
    : null;
};

export const appleBySearch = async (
  artist: string,
  title: string
): Promise<AlbumLink | null> => {
  const term = encodeURIComponent(`${artist} ${title}`);
  const res = await getJson<{ results: ItunesAlbum[] }>(
    `https://itunes.apple.com/search?term=${term}&entity=album&limit=10`
  );
  const album = pickSameAlbum({ artist, title }, res?.results ?? [], (r) => ({
    artist: r.artistName,
    title: r.collectionName,
  }));
  return album
    ? {
        type: Adapter.AppleMusic,
        url: `https://music.apple.com/album/${album.collectionId}`,
        via: "search",
      }
    : null;
};

export const deezerBySearch = async (
  artist: string,
  title: string
): Promise<AlbumLink | null> => {
  const q = encodeURIComponent(`artist:"${artist}" album:"${title}"`);
  const res = await getJson<{ data: DeezerAlbum[] }>(
    `https://api.deezer.com/search/album?q=${q}&limit=10`
  );
  const album = pickSameAlbum({ artist, title }, res?.data ?? [], (r) => ({
    artist: r.artist?.name ?? "",
    title: r.title,
  }));
  return album
    ? {
        type: Adapter.Deezer,
        url: `https://www.deezer.com/album/${album.id}`,
        via: "search",
      }
    : null;
};

export type PlatformAlbum = {
  title: string;
  artist: string;
  /** Barcode, when the platform exposes it (Spotify, Deezer). */
  upc: string | null;
  /** The album's own link on that platform. */
  url: string;
  imageUrl: string | null;
};

/** Apple's official lookup by album or song id (a song resolves to its album). */
export const appleAlbumById = async (
  id: string
): Promise<PlatformAlbum | null> => {
  const res = await getJson<{
    results: (ItunesAlbum & { wrapperType?: string; artworkUrl100?: string })[];
  }>(
    `https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}&entity=album`
  );
  const hit = res?.results.find((r) => r.collectionId && r.collectionName);
  if (!hit) return null;
  return {
    title: hit.collectionName,
    artist: hit.artistName,
    upc: null,
    url: `https://music.apple.com/album/${hit.collectionId}`,
    imageUrl: hit.artworkUrl100?.replace("100x100", "600x600") ?? null,
  };
};

/** Deezer's official API: album by id (a track resolves to its album). */
export const deezerAlbumById = async (
  id: string,
  kind: "album" | "track" = "album"
): Promise<PlatformAlbum | null> => {
  let albumId = id;
  if (kind === "track") {
    const t = await getJson<{ album?: { id: number } }>(
      `https://api.deezer.com/track/${id}`
    );
    if (!t?.album?.id) return null;
    albumId = String(t.album.id);
  }
  const a = await getJson<DeezerAlbum & { upc?: string; cover_xl?: string }>(
    `https://api.deezer.com/album/${albumId}`
  );
  if (!a?.id || a.error) return null;
  return {
    title: a.title,
    artist: a.artist?.name ?? "",
    upc: a.upc ?? null,
    url: `https://www.deezer.com/album/${a.id}`,
    imageUrl: a.cover_xl ?? null,
  };
};
