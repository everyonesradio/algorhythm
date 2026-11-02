import { Adapter } from "@/config/enum";
import type {
  AlbumLink,
  PlatformAlbum,
} from "@/server/services/vinyl/platform-links";

/**
 * "Paste any music link, get it everywhere": which album a streaming link
 * points to, then that album's links on every platform.
 *
 * Replaces the old scrapers (src/parsers, src/adapters, services/search),
 * which read platform web pages and picked the closest-sounding search
 * result, sometimes the wrong album. Every step here is exact:
 *
 *   1. Official platform API for the album behind the link: title, artist,
 *      barcode (Spotify Web API, Apple's iTunes lookup, Deezer API).
 *   2. The MusicBrainz album: the URL itself (editors link streaming URLs
 *      to releases), else the barcode, else a strict artist + title match.
 *   3. That album's links from MusicBrainz + barcodes (vinyl/links.ts).
 *   4. No MusicBrainz album: the source link plus barcode / strict-match
 *      links on Apple Music and Deezer.
 */

export type LinkKind = "album" | "track";
export type ParsedLink = {
  platform: Adapter;
  kind: LinkKind;
  id: string;
  url: string;
};

/** Recognise a streaming link (albums, and tracks via their album). */
export const parseMusicLink = (raw: string): ParsedLink | null => {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");
  const path = u.pathname;
  let m: RegExpMatchArray | null;

  if (host === "open.spotify.com") {
    m = path.match(
      /^\/(?:intl-[a-z]{2}\/)?(album|track)\/([A-Za-z0-9]{10,30})/
    );
    if (m) {
      const kind = m[1] as LinkKind;
      return {
        platform: Adapter.Spotify,
        kind,
        id: m[2],
        url: `https://open.spotify.com/${kind}/${m[2]}`,
      };
    }
  }
  if (host === "music.apple.com" || host === "itunes.apple.com") {
    // /us/album/name/123?i=456 is a song on album 123: the album is wanted.
    m = path.match(/\/(album|song)\/(?:[^/]+\/)?(?:id)?(\d+)$/);
    if (m) {
      const kind = m[1] === "song" ? "track" : "album";
      return {
        platform: Adapter.AppleMusic,
        kind,
        id: m[2],
        url: `https://music.apple.com/${m[1]}/${m[2]}`,
      };
    }
  }
  if (host === "deezer.com") {
    m = path.match(/\/(album|track)\/(\d+)/);
    if (m) {
      const kind = m[1] as LinkKind;
      return {
        platform: Adapter.Deezer,
        kind,
        id: m[2],
        url: `https://www.deezer.com/${kind}/${m[2]}`,
      };
    }
  }
  if (host === "tidal.com" || host === "listen.tidal.com") {
    m = path.match(/\/(album|track)\/(\d+)/);
    if (m) {
      const kind = m[1] as LinkKind;
      return {
        platform: Adapter.Tidal,
        kind,
        id: m[2],
        url: `https://tidal.com/${kind}/${m[2]}`,
      };
    }
  }
  if (host === "music.youtube.com") {
    const list = u.searchParams.get("list");
    if (path === "/playlist" && list?.startsWith("OLAK5uy_")) {
      return {
        platform: Adapter.YouTube,
        kind: "album",
        id: list,
        url: `https://music.youtube.com/playlist?list=${list}`,
      };
    }
    m = path.match(/^\/browse\/(MPREb_[\w-]+)/);
    if (m) {
      return {
        platform: Adapter.YouTube,
        kind: "album",
        id: m[1],
        url: `https://music.youtube.com/browse/${m[1]}`,
      };
    }
  }
  if (host === "soundcloud.com") {
    m = path.match(/^\/([\w-]+)\/sets\/([\w-]+)/);
    if (m) {
      return {
        platform: Adapter.SoundCloud,
        kind: "album",
        id: `${m[1]}/${m[2]}`,
        url: `https://soundcloud.com/${m[1]}/sets/${m[2]}`,
      };
    }
  }
  return null;
};

export type ResolveDeps = {
  /** Official platform lookups; missing platforms have none (Tidal, YouTube, SoundCloud). */
  platformAlbum: Partial<
    Record<Adapter, (link: ParsedLink) => Promise<PlatformAlbum | null>>
  >;
  mbByUrl: (url: string) => Promise<string | null>;
  mbByBarcode: (upc: string) => Promise<string | null>;
  mbByArtistTitle: (artist: string, title: string) => Promise<string | null>;
  /** All links for a MusicBrainz album (cached when it's in the catalog). */
  albumLinks: (
    mbid: string,
    hint: { spotifyUrl: string | null }
  ) => Promise<{ title: string; artist: string; links: AlbumLink[] }>;
  /** Exact links for an album MusicBrainz doesn't know. */
  fallbackLinks: (album: PlatformAlbum) => Promise<AlbumLink[]>;
};

export type ResolvedLink = {
  title: string | null;
  artist: string | null;
  imageUrl: string | null;
  /** MusicBrainz release group, when found. */
  mbid: string | null;
  links: AlbumLink[];
};

export class UnsupportedLinkError extends Error {}

const ORDER = [
  Adapter.Spotify,
  Adapter.AppleMusic,
  Adapter.YouTube,
  Adapter.Tidal,
  Adapter.Deezer,
  Adapter.SoundCloud,
];

/** Source link first-class: it's exact by definition. */
const withSource = (links: AlbumLink[], source: AlbumLink | null) => {
  const byType = new Map(links.map((l) => [l.type, l]));
  if (source) byType.set(source.type, source);
  return ORDER.flatMap((t) => (byType.has(t) ? [byType.get(t)!] : []));
};

export const resolveMusicLink = async (
  raw: string,
  deps: ResolveDeps
): Promise<ResolvedLink> => {
  const link = parseMusicLink(raw);
  if (!link) {
    throw new UnsupportedLinkError(
      "Paste a Spotify, Apple Music, Deezer, Tidal, YouTube Music or SoundCloud album or track link"
    );
  }

  // 1. What the platform itself says the album is.
  const lookup = deps.platformAlbum[link.platform];
  const album = lookup ? await lookup(link).catch(() => null) : null;
  // A track link stands for its album; the album URL is what we link to.
  const albumUrl = album?.url ?? (link.kind === "album" ? link.url : null);
  const source: AlbumLink | null = albumUrl
    ? { type: link.platform, url: albumUrl, via: "source" }
    : null;

  // 2. The MusicBrainz album, most exact first.
  const attempts: (() => Promise<string | null>)[] = [
    ...(albumUrl ? [() => deps.mbByUrl(albumUrl)] : []),
    ...(album?.upc ? [() => deps.mbByBarcode(album.upc!)] : []),
    ...(album ? [() => deps.mbByArtistTitle(album.artist, album.title)] : []),
  ];
  let mbid: string | null = null;
  for (const attempt of attempts) {
    mbid = await attempt().catch(() => null);
    if (mbid) break;
  }

  // 3. Everything MusicBrainz + barcodes know about that album.
  if (mbid) {
    const res = await deps.albumLinks(mbid, {
      spotifyUrl: link.platform === Adapter.Spotify ? albumUrl : null,
    });
    return {
      title: res.title,
      artist: res.artist,
      imageUrl: album?.imageUrl ?? null,
      mbid,
      links: withSource(res.links, source),
    };
  }

  // 4. Not on MusicBrainz: exact platform lookups only.
  const extra = album ? await deps.fallbackLinks(album).catch(() => []) : [];
  return {
    title: album?.title ?? null,
    artist: album?.artist ?? null,
    imageUrl: album?.imageUrl ?? null,
    mbid: null,
    links: withSource(extra, source),
  };
};
