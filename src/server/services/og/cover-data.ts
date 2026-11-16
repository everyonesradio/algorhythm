const COVER_HOSTS =
  /(^|\.)(coverartarchive\.org|archive\.org|scdn\.co|discogs\.com)$/;
const MAX_REDIRECTS = 5;

const onCoverHost = (url: URL) =>
  url.protocol === "https:" && COVER_HOSTS.test(url.hostname);

// Cover Art Archive redirects to archive.org mirrors, so redirects are
// followed by hand and every hop must stay on a cover host.
const fetchCover = async (start: URL) => {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!onCoverHost(url)) return null;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "algoRhythm/0.1 (+https://github.com/everyonesradio/algorhythm)",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(6000),
    });
    const location = res.headers.get("location");
    if (res.status < 300 || res.status >= 400 || !location) return res;
    url = new URL(location, url);
  }
  return null;
};

// The renderer can't draw WebP, so JPEG/PNG only.
export const coverData = async (url: string | null) => {
  if (!url) return null;
  try {
    const res = await fetchCover(new URL(url));
    if (!res) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/^image\/(jpeg|png)/.test(type)) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > 4 * 1024 * 1024) return null;
    return `data:${type.split(";")[0]};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
};
