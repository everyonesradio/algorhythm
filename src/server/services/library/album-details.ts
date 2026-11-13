import type { Prisma, PrismaClient } from "@prisma/client";

import type { MbTrackRelease } from "@/server/services/catalog/musicbrainz";
import { normalizeName } from "@/server/services/catalog/musicbrainz";

/**
 * Extra album information for the library. Sourced, never generated:
 *
 *   tracklist  MusicBrainz (an official release, vinyl preferred); Spotify's
 *              Web API when MusicBrainz has none and credentials are set.
 *   about      the first sentence or two of Wikipedia, reached through the
 *              Wikidata item MusicBrainz links. CC BY-SA, so it's shown
 *              unedited (just shortened) with a link to the article.
 *   more       links to the album on AllMusic, Metacritic, Rate Your Music,
 *              Genius and Discogs (from Wikidata), MusicBrainz "review"
 *              links, and review scores Wikidata records with their source.
 *              Links only: published reviews aren't ours to copy.
 *
 * Sides (A1, B1…) are shown only when the release numbers its tracks that
 * way: side splits differ between pressings, so they're never invented.
 * Cached on Album.extra.details for 30 days (7 when nothing was found).
 */

export const DETAILS_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const EMPTY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** A source was down or rate-limiting: try again the next day. */
export const PARTIAL_TTL_MS = 24 * 60 * 60 * 1000;
/** About text: at most two sentences and this many characters. */
export const ABOUT_MAX = 240;
// 2: review links carry site names ("Pitchfork", not "pitchfork.com").
const DETAILS_VERSION = 2;

export type Track = { position: string; title: string; length: string | null };
export type Tracklist = {
  source: "musicbrainz" | "spotify";
  sides: boolean;
  tracks: Track[];
};
export type About = { text: string; url: string };
export type SiteLink = { name: string; url: string };
export type ReviewScore = { source: string; score: string };
export type AlbumDetails = {
  version: number;
  fetchedAt: string;
  /** Some source failed temporarily; refreshed sooner. */
  partial?: boolean;
  tracklist: Tracklist | null;
  about: { album: About | null; artist: About | null };
  /** Reviews and reference pages to read elsewhere: links only. */
  more: { links: SiteLink[]; scores: ReviewScore[] };
};

export type WikidataInfo = {
  wikipedia: { extract: string; url: string } | null;
  transient?: boolean;
  links: SiteLink[];
  scores: ReviewScore[];
};

export type DetailsDeps = {
  releasesWithTracks: (rgMbid: string) => Promise<MbTrackRelease[]>;
  releaseGroupLinks: (
    rgMbid: string
  ) => Promise<{ wikidata: string | null; reviews: string[] }>;
  artistWikidata: (artistMbid: string) => Promise<string | null>;
  wikidata: (qid: string) => Promise<WikidataInfo | null>;
  spotifyTracks: (spotifyId: string) => Promise<
    | {
        name: string;
        track_number: number;
        disc_number: number;
        duration_ms: number;
      }[]
    | null
  >;
};

const clock = (ms?: number | null) => {
  if (!ms || ms <= 0) return null;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** First one or two sentences, at most ABOUT_MAX characters. */
export const concise = (text: string, max = ABOUT_MAX) => {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  // Split after . ! ? followed by a capital, so "U.S." or "Vol. 2" stay put.
  const sentences = clean.split(/(?<=[.!?])\s+(?=[A-Z"“(])/);
  let out = "";
  for (const s of sentences.slice(0, 2)) {
    const next = out ? `${out} ${s}` : s;
    if (next.length > max) break;
    out = next;
  }
  if (out) return out;
  // One very long first sentence: cut at a word boundary.
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${space > max / 2 ? cut.slice(0, space) : cut}…`;
};

/** The release whose tracklist we show: official vinyl with the album's title, earliest. */
export const pickRelease = (releases: MbTrackRelease[], albumTitle: string) => {
  const title = normalizeName(albumTitle);
  const score = (r: MbTrackRelease) =>
    (r.media?.some((m) => /vinyl/i.test(m.format ?? "")) ? 4 : 0) +
    (normalizeName(r.title) === title ? 2 : 0);
  return (
    [...releases]
      .filter((r) => r.media?.some((m) => m.tracks?.length))
      .sort(
        (a, b) =>
          score(b) - score(a) ||
          (a.date || "9999").localeCompare(b.date || "9999")
      )[0] ?? null
  );
};

export const tracklistFromRelease = (
  release: MbTrackRelease
): Tracklist | null => {
  const media = (release.media ?? []).filter((m) => m.tracks?.length);
  const tracks = media.flatMap((m) =>
    (m.tracks ?? []).map((t) => ({
      // Several discs numbered 1, 2, 3… each: prefix the disc ("2-4").
      position:
        media.length > 1 && /^\d+$/.test(t.number)
          ? `${m.position ?? 1}-${t.number}`
          : t.number,
      title: t.title,
      length: clock(t.length),
    }))
  );
  if (!tracks.length) return null;
  return {
    source: "musicbrainz",
    sides: tracks.every((t) => /^[A-H]\d+$/i.test(t.position)),
    tracks,
  };
};

const isFresh = (d: AlbumDetails | undefined, now: number) => {
  if (!d?.fetchedAt || d.version !== DETAILS_VERSION) return false;
  const age = now - Date.parse(d.fetchedAt);
  const empty =
    !d.tracklist && !d.about.album && !d.about.artist && !d.more.links.length;
  return (
    age < (d.partial ? PARTIAL_TTL_MS : empty ? EMPTY_TTL_MS : DETAILS_TTL_MS)
  );
};

/** Review sites MusicBrainz links, by their usual names. */
const SITE_NAMES: Record<string, string> = {
  "pitchfork.com": "Pitchfork",
  "bbc.co.uk": "BBC Music",
  "allmusic.com": "AllMusic",
  "rollingstone.com": "Rolling Stone",
  "theguardian.com": "The Guardian",
  "nme.com": "NME",
  "ra.co": "Resident Advisor",
  "residentadvisor.net": "Resident Advisor",
  "thequietus.com": "The Quietus",
  "sputnikmusic.com": "Sputnikmusic",
  "popmatters.com": "PopMatters",
  "slantmagazine.com": "Slant",
  "avclub.com": "The A.V. Club",
};

const siteName = (url: string) => {
  try {
    const host = new URL(url).hostname.replace(/^(www|music)\./, "");
    return SITE_NAMES[host] ?? host;
  } catch {
    return null;
  }
};

export const getAlbumDetails = async (
  prisma: PrismaClient,
  albumId: string,
  deps: DetailsDeps,
  now = Date.now()
): Promise<AlbumDetails | null> => {
  const album = await prisma.album.findUnique({
    where: { id: albumId },
    select: {
      mbid: true,
      title: true,
      artistMbid: true,
      spotifyId: true,
      extra: true,
    },
  });
  if (!album) return null;
  const extra =
    album.extra &&
    typeof album.extra === "object" &&
    !Array.isArray(album.extra)
      ? (album.extra as Record<string, unknown>)
      : {};
  const cached = extra.details as AlbumDetails | undefined;
  if (isFresh(cached, now)) return cached!;

  // A failed request means "unknown", not "none": refresh sooner.
  let partial = false;
  const safe = <T>(p: Promise<T>) =>
    p.catch(() => {
      partial = true;
      return null;
    });
  const [releases, rgLinks, artistQid] = await Promise.all([
    album.mbid ? safe(deps.releasesWithTracks(album.mbid)) : null,
    album.mbid ? safe(deps.releaseGroupLinks(album.mbid)) : null,
    album.artistMbid ? safe(deps.artistWikidata(album.artistMbid)) : null,
  ]);

  const release = releases ? pickRelease(releases, album.title) : null;
  let tracklist = release ? tracklistFromRelease(release) : null;
  if (!tracklist && album.spotifyId) {
    const items = await safe(deps.spotifyTracks(album.spotifyId));
    if (items?.length) {
      const discs = new Set(items.map((t) => t.disc_number)).size;
      tracklist = {
        source: "spotify",
        sides: false,
        tracks: items.map((t) => ({
          position:
            discs > 1
              ? `${t.disc_number}-${t.track_number}`
              : String(t.track_number),
          title: t.name,
          length: clock(t.duration_ms),
        })),
      };
    }
  }

  const [albumInfo, artistInfo] = await Promise.all([
    rgLinks?.wikidata ? safe(deps.wikidata(rgLinks.wikidata)) : null,
    artistQid ? safe(deps.wikidata(artistQid)) : null,
  ]);
  const about = (info: WikidataInfo | null): About | null => {
    const text = info?.wikipedia ? concise(info.wikipedia.extract) : "";
    return text && info?.wikipedia ? { text, url: info.wikipedia.url } : null;
  };

  // Review links editors attached in MusicBrainz, named by their site.
  const reviewLinks: SiteLink[] = (rgLinks?.reviews ?? [])
    .slice(0, 6)
    .flatMap((url) => {
      const name = siteName(url);
      return name ? [{ name, url }] : [];
    });
  // One link per site; Wikidata's own IDs come first.
  const links = [...(albumInfo?.links ?? []), ...reviewLinks].filter(
    (l, i, all) => all.findIndex((x) => x.name === l.name) === i
  );

  const details: AlbumDetails = {
    version: DETAILS_VERSION,
    fetchedAt: new Date(now).toISOString(),
    partial: partial || !!albumInfo?.transient || !!artistInfo?.transient,
    tracklist,
    about: { album: about(albumInfo), artist: about(artistInfo) },
    more: { links, scores: albumInfo?.scores ?? [] },
  };
  await prisma.album.update({
    where: { id: albumId },
    data: {
      extra: { ...extra, details } as unknown as Prisma.InputJsonValue,
    },
  });
  return details;
};
