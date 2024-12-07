import { ENV } from "@/config/env";

import {
  cacheShortenLink,
  getCachedShortenLink,
} from "@/server/services/cache";

import HttpClient from "./http-client";
import { logger } from "./logger";

interface ApiResponse {
  data: {
    id: string;
    refer: string;
    origin: string;
  };
}

export async function shortenLink(link: string) {
  const cache = await getCachedShortenLink(link);
  if (cache) {
    logger.info(`[url-shortener] (${link}) cache hit`);
    return cache;
  }

  let refer = link;

  try {
    if (!ENV.utils.urlShortener.apiUrl) {
      logger.error("[url-shortener] API URL is not configured");
      return refer;
    }

    const response = await HttpClient.post<ApiResponse>(
      ENV.utils.urlShortener.apiUrl,
      {
        url: link,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": ENV.utils.urlShortener.apiKey,
        },
      }
    );

    refer = response.data.refer;
    await cacheShortenLink(link, refer);
  } catch (err) {
    logger.error(`[url-shortener] (${link}) request failed ${err}`);
    // Return original link if shortening fails
    return link;
  }

  return refer;
}
