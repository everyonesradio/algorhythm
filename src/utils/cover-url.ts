const PROXIED_HOSTS = new Set(["i.discogs.com"]);

export const textureUrl = (url: string) => {
  try {
    return PROXIED_HOSTS.has(new URL(url).hostname)
      ? `/api/cover?u=${encodeURIComponent(url)}`
      : url;
  } catch {
    return url;
  }
};
