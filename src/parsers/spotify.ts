import { MetadataType, Parser } from "@/config/enum";

import { logger } from "@/utils/logger";
import { getCheerioDoc, metaTagContent } from "@/utils/scraper";

import { SearchMetadata } from "@/server/services/search";
import {
  cacheSearchMetadata,
  getCachedSearchMetadata,
} from "@/server/services/cache";

import {
  SPOTIFY_LINK_DESKTOP_REGEX,
  SPOTIFY_LINK_MOBILE_REGEX,
} from "@/config/constants";
import { defaultHeaders, fetchMetadata } from "@/server/services/metadata";
import HttpClient from "@/utils/http-client";

enum SpotifyMetadataType {
  Song = "music.song",
  Album = "music.album",
  Playlist = "music.playlist",
  Artist = "profile",
  Podcast = "music.episode",
  Show = "website",
}

const SPOTIFY_METADATA_TO_METADATA_TYPE = {
  [SpotifyMetadataType.Song]: MetadataType.Song,
  [SpotifyMetadataType.Album]: MetadataType.Album,
  [SpotifyMetadataType.Playlist]: MetadataType.Playlist,
  [SpotifyMetadataType.Artist]: MetadataType.Artist,
  [SpotifyMetadataType.Podcast]: MetadataType.Podcast,
  [SpotifyMetadataType.Show]: MetadataType.Show,
};

export const getSpotifyMetadata = async (id: string, link: string) => {
  const cached = await getCachedSearchMetadata(id, Parser.Spotify);
  if (cached) {
    logger.info(`[Spotify] (${id}) metadata cache hit`);
    return cached;
  }

  try {
    let html = await fetchMetadata(link);

    if (SPOTIFY_LINK_MOBILE_REGEX.test(link)) {
      link = html.match(SPOTIFY_LINK_DESKTOP_REGEX)?.[0] ?? "";

      if (!link) {
        throw new Error("Invalid mobile spotify link");
      }

      // wait a random amount of time to avoid rate limiting
      await new Promise((res) => setTimeout(res, Math.random() * 1000));

      logger.info(
        `[${getSpotifyMetadata.name}] parse metadata (desktop): ${link}`
      );

      html = await HttpClient.get<string>(link, {
        headers: defaultHeaders,
        retries: 2,
      });
    }

    const doc = getCheerioDoc(html);

    const title = metaTagContent(doc, "og:title", "property")?.trim();
    const description = metaTagContent(doc, "og:description", "property");
    const image = metaTagContent(doc, "og:image", "property");
    const audio = metaTagContent(doc, "og:audio", "property");

    const type = link.includes("episode")
      ? SpotifyMetadataType.Podcast
      : (metaTagContent(doc, "og:type", "property") as SpotifyMetadataType);

    if (!title || !description || !type || !image) {
      throw new Error("Spotify metadata not found");
    }

    const metadata = {
      id,
      title,
      description,
      type: SPOTIFY_METADATA_TO_METADATA_TYPE[type],
      image,
      audio,
    } as SearchMetadata;

    await cacheSearchMetadata(id, Parser.Spotify, metadata);

    return metadata;
  } catch (err) {
    throw new Error(`[${getSpotifyMetadata.name}] (${link}) ${err}`);
  }
};

export const getSpotifyQueryFromMetadata = (metadata: SearchMetadata) => {
  const parsedTitle = metadata.title
    .replace(
      /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u26FF\u2700-\u27BF\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDD00-\uDDFF]/g,
      ""
    )
    .trim();

  let query = parsedTitle;

  if (metadata.type === MetadataType.Song) {
    const [, artist] =
      metadata.description.match(/^([^·]+) · Song · \d+$/) ?? [];
    query = artist ? `${query} ${artist}` : query;
  }

  if (metadata.type === MetadataType.Album) {
    const [, artist] = metadata.description.match(/(.+?) · Album ·/) ?? [];

    query = artist ? `${query} ${artist}` : query;
  }

  if (metadata.type === MetadataType.Playlist) {
    query = `${query.replace(/This is /, "")} Playlist`;
  }

  if (metadata.type === MetadataType.Podcast) {
    const [, artist] =
      metadata.description.match(/from (.+?) on Spotify\./) ?? [];

    query = artist ? `${query} ${artist}` : query;
  }

  return query;
};
