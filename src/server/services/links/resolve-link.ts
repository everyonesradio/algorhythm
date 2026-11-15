import { Adapter } from "@/config/enum";
import type { MbRelease } from "@/server/services/catalog/musicbrainz";
import type {
  AlbumLink,
  PlatformAlbum,
} from "@/server/services/vinyl/platform-links";

export type LinkKind = "album" | "track";
export type ParsedLink = {
  platform: Adapter;
  kind: LinkKind;
  id: string;
  url: string;
};

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
    // /album/name/123?i=456 is a song on album 123: ?i is ignored on purpose.
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

export type MbAlbum = {
  mbid: string;
  title: string;
  artist: string;
  artistName: string | null;
  release: MbRelease;
};

export type ResolvedLink = {
  title: string | null;
  artist: string | null;
  imageUrl: string | null;
  mbid: string | null;
  links: AlbumLink[];
};

export type ResolveDeps = {
  store: {
    get: (
      url: string
    ) => Promise<{ value: ResolvedLink; stale: boolean } | null>;
    put: (value: ResolvedLink, urls: string[]) => Promise<void>;
  };
  platformAlbum: Partial<
    Record<Adapter, (link: ParsedLink) => Promise<PlatformAlbum | null>>
  >;
  mbReleaseForUrl: (url: string) => Promise<string | null>;
  mbReleaseForBarcode: (upc: string) => Promise<string | null>;
  mbRelease: (releaseId: string) => Promise<MbAlbum | null>;
  mbByArtistTitle: (artist: string, title: string) => Promise<string | null>;
  albumLinks: (
    album: {
      mbid: string;
      title: string;
      artist: string;
      artistName: string | null;
      spotifyUrl: string | null;
    },
    releases?: MbRelease[]
  ) => Promise<AlbumLink[]>;
  fallbackLinks: (album: PlatformAlbum) => Promise<AlbumLink[]>;
  background?: (task: Promise<unknown>) => void;
  budgetMs?: number;
};

export const MB_BUDGET_MS = 1500;

export class UnsupportedLinkError extends Error {}

const ORDER = [
  Adapter.Spotify,
  Adapter.AppleMusic,
  Adapter.YouTube,
  Adapter.Tidal,
  Adapter.Deezer,
  Adapter.SoundCloud,
];

const withSource = (links: AlbumLink[], source: AlbumLink | null) => {
  const byType = new Map(links.map((l) => [l.type, l]));
  if (source) byType.set(source.type, source);
  return ORDER.flatMap((t) => (byType.has(t) ? [byType.get(t)!] : []));
};

const urlsOf = (value: ResolvedLink, extra: (string | null)[]) => [
  ...new Set(
    [...value.links.map((l) => l.url), ...extra].filter((u): u is string => !!u)
  ),
];

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

  const stored = await deps.store.get(link.url).catch(() => null);
  if (stored) {
    if (stored.stale)
      deps.background?.(resolveFresh(link, deps).catch(() => null));
    return stored.value;
  }
  return resolveFresh(link, deps);
};

const resolveFresh = async (
  link: ParsedLink,
  deps: ResolveDeps
): Promise<ResolvedLink> => {
  const lookup = deps.platformAlbum[link.platform];
  const platformP = lookup
    ? lookup(link).catch(() => null)
    : Promise.resolve(null);
  const urlP =
    link.kind === "album"
      ? deps.mbReleaseForUrl(link.url).catch(() => null)
      : Promise.resolve(null);
  const quickP = platformP.then((a) =>
    a ? deps.fallbackLinks(a).catch(() => []) : null
  );

  const albumUrlOf = (album: PlatformAlbum | null) =>
    album?.url ?? (link.kind === "album" ? link.url : null);
  const sourceOf = (url: string | null): AlbumLink | null =>
    url ? { type: link.platform, url, via: "source" } : null;
  const store = (value: ResolvedLink, albumUrl: string | null) =>
    value.links.length
      ? deps.store
          .put(value, urlsOf(value, [link.url, albumUrl]))
          .catch(() => undefined)
      : Promise.resolve();

  const fullP = (async () => {
    let releaseId = await urlP;
    const album = await platformP;
    const albumUrl = albumUrlOf(album);
    const source = sourceOf(albumUrl);
    const spotifyUrl = link.platform === Adapter.Spotify ? albumUrl : null;
    if (!releaseId && albumUrl && albumUrl !== link.url) {
      releaseId = await deps.mbReleaseForUrl(albumUrl).catch(() => null);
    }
    if (!releaseId && album?.upc) {
      releaseId = await deps.mbReleaseForBarcode(album.upc).catch(() => null);
    }
    const mb = releaseId
      ? await deps.mbRelease(releaseId).catch(() => null)
      : null;

    if (mb) {
      const meta = {
        mbid: mb.mbid,
        title: mb.title,
        artist: mb.artist,
        artistName: mb.artistName,
        spotifyUrl,
      };
      const value: ResolvedLink = {
        title: mb.title,
        artist: mb.artist,
        imageUrl: album?.imageUrl ?? null,
        mbid: mb.mbid,
        links: withSource(await deps.albumLinks(meta, [mb.release]), source),
      };
      return {
        value,
        albumUrl,
        enrich: () => deps.albumLinks(meta).then((l) => withSource(l, source)),
      };
    }
    const mbid = album
      ? await deps.mbByArtistTitle(album.artist, album.title).catch(() => null)
      : null;
    const links = mbid
      ? await deps.albumLinks({
          mbid,
          title: album!.title,
          artist: album!.artist,
          artistName: null,
          spotifyUrl,
        })
      : ((await quickP) ?? []);
    const value: ResolvedLink = {
      title: album?.title ?? null,
      artist: album?.artist ?? null,
      imageUrl: album?.imageUrl ?? null,
      mbid,
      links: withSource(links, source),
    };
    return { value, albumUrl, enrich: null };
  })();

  const settle = async (full: Awaited<typeof fullP>) => {
    await store(full.value, full.albumUrl);
    if (!full.enrich) return;
    const all = await full.enrich().catch(() => null);
    if (all && all.length > full.value.links.length) {
      const richer = { ...full.value, links: all };
      await store(richer, full.albumUrl);
    }
  };

  const budget = deps.budgetMs ?? MB_BUDGET_MS;
  const inTime = await Promise.race([
    fullP.then((full) => full),
    new Promise<null>((r) => setTimeout(() => r(null), budget)),
  ]);
  if (inTime) {
    await store(inTime.value, inTime.albumUrl);
    if (inTime.enrich && deps.background)
      deps.background(settle(inTime).catch(() => null));
    return inTime.value;
  }

  const [album, quick] = await Promise.all([platformP, quickP]);
  if (!album || !quick) {
    const full = await fullP;
    await store(full.value, full.albumUrl);
    if (full.enrich && deps.background)
      deps.background(settle(full).catch(() => null));
    return full.value;
  }
  const albumUrl = albumUrlOf(album);
  const quickValue: ResolvedLink = {
    title: album.title,
    artist: album.artist,
    imageUrl: album.imageUrl,
    mbid: null,
    links: withSource(quick, sourceOf(albumUrl)),
  };
  if (deps.background) deps.background(fullP.then(settle).catch(() => null));
  return quickValue;
};
