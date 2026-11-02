import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Cover image pass-through for hosts that don't send CORS headers.
 *
 * The 3D sleeve draws the cover as a WebGL texture, which needs CORS.
 * Cover Art Archive and Spotify send `Access-Control-Allow-Origin: *`;
 * Discogs' image CDN doesn't, so its covers (pressings, Discogs-only
 * albums) come through here. Only allow-listed hosts, images only.
 */
const ALLOWED_HOSTS = new Set(["i.discogs.com"]);
const MAX_BYTES = 8 * 1024 * 1024;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const raw = typeof req.query.u === "string" ? req.query.u : "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return res.status(400).end();
  }
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) {
    return res.status(400).end();
  }

  const upstream = await fetch(url, {
    headers: { "User-Agent": "algoRhythm/0.1 (+https://github.com/everyonesradio/algorhythm)" },
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  const type = upstream?.headers.get("content-type") ?? "";
  if (!upstream?.ok || !type.startsWith("image/")) {
    return res.status(upstream?.status === 404 ? 404 : 502).end();
  }
  const body = Buffer.from(await upstream.arrayBuffer());
  if (body.length > MAX_BYTES) return res.status(502).end();

  res.setHeader("Content-Type", type);
  // Discogs image URLs are content-addressed: cache hard at the edge.
  res.setHeader("Cache-Control", "public, max-age=604800, s-maxage=2592000, immutable");
  res.setHeader("Access-Control-Allow-Origin", "*");
  return res.status(200).send(body);
}
