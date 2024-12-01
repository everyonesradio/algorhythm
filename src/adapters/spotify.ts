import { ENV } from "@/config/env";

import { ADAPTERS_QUERY_LIMIT } from "@/config/constants";
import { MetadataType, Adapter } from "@/config/enum";

import HttpClient from "@/utils/http-client";
import { logger } from "@/utils/logger";
import { responseMatchesQuery } from "@/utils/compare";

import { SearchMetadata, SearchResultLink } from "@/server/services/search";
import {
  cacheSearchResultLink,
  cacheSpotifyAccessToken,
  getCachedSearchResultLink,
  getCachedSpotifyAccessToken,
} from "@/server/services/cache";

interface SpotifyAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface SpotifySearchResponse {
  [type: string]: {
    total: number;
    items: [
      {
        name: string;
        external_urls: {
          spotify: string;
        };
      },
    ];
  };
}

const SPOTIFY_SEARCH_TYPES = {
  [MetadataType.Song]: "track",
  [MetadataType.Album]: "album",
  [MetadataType.Playlist]: "playlist",
  [MetadataType.Artist]: "artist",
  [MetadataType.Show]: "show",
  [MetadataType.Podcast]: "episode",
};

export async function getSpotifyLink(query: string, metadata: SearchMetadata) {
  const searchType = SPOTIFY_SEARCH_TYPES[metadata.type];

  if (!searchType) {
    return;
  }

  const params = new URLSearchParams({
    q: query,
    type: searchType,
    limit: String(ADAPTERS_QUERY_LIMIT),
  });

  const url = new URL(ENV.adapters.spotify.apiUrl);
  url.search = params.toString();

  const cache = await getCachedSearchResultLink(url);
  if (cache) {
    logger.info(`[Spotify] (${url}) cache hit`);
    return cache;
  }

  try {
    const response = await HttpClient.get<SpotifySearchResponse>(
      url.toString(),
      {
        headers: {
          Authorization: `Bearer ${await getOrUpdateSpotifyAccessToken()}`,
        },
      }
    );

    const [[, data]] = Object.entries(response);

    if (data.total === 0) {
      throw new Error(`No results found: ${JSON.stringify(response)}`);
    }

    const { name, external_urls } = data.items[0];

    const searchResultLink = {
      type: Adapter.Spotify,
      url: external_urls.spotify,
      isVerified: responseMatchesQuery(name ?? "", query),
    } as SearchResultLink;

    await cacheSearchResultLink(url, searchResultLink);

    return searchResultLink;
  } catch (error) {
    logger.error(`[Spotify] (${url}) ${error}`);
  }
}

export async function getOrUpdateSpotifyAccessToken() {
  const cache = await getCachedSpotifyAccessToken();

  if (cache) {
    return cache;
  }

  const data = new URLSearchParams({
    grant_type: "client_credentials",
  });

  const response = await HttpClient.post<SpotifyAuthResponse>(
    ENV.adapters.spotify.authUrl,
    data,
    {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          Buffer.from(
            ENV.adapters.spotify.clientId +
              ":" +
              ENV.adapters.spotify.clientSecret
          ).toString("base64"),
      },
    }
  );

  await cacheSpotifyAccessToken(response.access_token, response.expires_in);

  return response.access_token;
}
