// ** Custom Components, Hooks, Utils, etc.
import {
  APPLE_MUSIC_LINK_REGEX,
  DEEZER_LINK_REGEX,
  SOUNDCLOUD_LINK_REGEX,
  SPOTIFY_LINK_REGEX,
  YOUTUBE_LINK_REGEX,
} from "@/config/constants";
import { Parser } from "@/config/enum";
import { getSourceFromId } from "@/utils/encoding";
import { logger } from "@/utils/logger";

export type SearchParser = {
  id: string;
  type: string;
  source: string;
};

class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LinkParseError";
  }
}

export const getSearchParser = (link?: string, searchId?: string) => {
  const decodedSource = searchId ? getSourceFromId(searchId) : undefined;

  let source = link;

  if (searchId && decodedSource) {
    logger.info(
      `[${getSearchParser.name}] (${searchId}) source decoded: ${decodedSource}`
    );
    source = decodedSource;
  }

  if (!source) {
    throw new ParseError("Source not found");
  }

  let id, type;

  const spotifyId = source.match(SPOTIFY_LINK_REGEX)?.[3];
  if (spotifyId) {
    id = spotifyId;
    type = Parser.Spotify;
  }

  const youtubeId = source.match(YOUTUBE_LINK_REGEX)?.[1];
  if (youtubeId) {
    id = youtubeId;
    type = Parser.YouTube;
  }

  const appleMusicMatch = source.match(APPLE_MUSIC_LINK_REGEX);
  const appleMusicId = appleMusicMatch
    ? appleMusicMatch[3] || appleMusicMatch[2] || appleMusicMatch[1]
    : null;
  if (appleMusicId) {
    id = appleMusicId;
    type = Parser.AppleMusic;
  }

  const deezerId = source.match(DEEZER_LINK_REGEX)?.[1];
  if (deezerId) {
    id = deezerId;
    type = Parser.Deezer;
  }

  const soundCloudMatch = source.match(SOUNDCLOUD_LINK_REGEX);
  const soundCloudId = soundCloudMatch
    ? soundCloudMatch[3] || soundCloudMatch[2]
    : null;
  if (soundCloudId) {
    id = soundCloudId;
    type = Parser.SoundCloud;
  }

  if (!id || !type) {
    throw new ParseError("Service id could not be extracted from source.");
  }

  const searchParser = {
    id,
    type,
    source,
  } as SearchParser;

  return searchParser;
};
