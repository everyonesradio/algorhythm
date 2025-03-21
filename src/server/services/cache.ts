import { createCache } from "cache-manager";

import { ENV } from "@/config/env";
import type { Parser } from "@/config/enum";

import { SearchMetadata, SearchResultLink } from "@/server/services/search";

// Memory store by default
const cacheStore = createCache();

export const cacheSearchResultLink = async (
  url: URL,
  searchResultLink: SearchResultLink
) => {
  await cacheStore.set(`search:${url.toString()}`, searchResultLink);
};

export const getCachedSearchResultLink = async (url: URL) => {
  const data = (await cacheStore.get(
    `search:${url.toString()}`
  )) as SearchResultLink;

  return data;
};

export const cacheSearchMetadata = async (
  id: string,
  parser: Parser,
  searchMetadata: SearchMetadata
) => {
  await cacheStore.set(`metadata:${parser}:${id}`, searchMetadata);
};

export const getCachedSearchMetadata = async (id: string, parser: Parser) => {
  const data = (await cacheStore.get(
    `metadata:${parser}:${id}`
  )) as SearchMetadata;

  return data;
};

export const cacheSpotifyAccessToken = async (
  accessToken: string,
  expTime: number
) => {
  await cacheStore.set("spotify:accessToken", accessToken, expTime);
};

export const getCachedSpotifyAccessToken = async (): Promise<
  string | undefined
> => {
  const result = await cacheStore.get("spotify:accessToken");
  return result === null || result === undefined
    ? undefined
    : (result as string);
};

export const cacheShortenLink = async (link: string, refer: string) => {
  await cacheStore.set(`url-shortener:${link}`, refer);
};

export const getCachedShortenLink = async (
  link: string
): Promise<string | undefined> => {
  const result = await cacheStore.get(`url-shortener:${link}`);
  return result === null || result === undefined
    ? undefined
    : (result as string);
};
