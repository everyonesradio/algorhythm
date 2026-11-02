/** Hosts whose images can't be used as WebGL textures directly (no CORS). */
const PROXIED_HOSTS = new Set(["i.discogs.com"]);

/** A cover URL the 3D sleeve can load as a texture. */
export const textureUrl = (url: string) => {
  try {
    return PROXIED_HOSTS.has(new URL(url).hostname)
      ? `/api/cover?u=${encodeURIComponent(url)}`
      : url;
  } catch {
    return url;
  }
};
