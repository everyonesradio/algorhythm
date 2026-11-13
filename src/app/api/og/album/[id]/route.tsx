import { readFile } from "node:fs/promises";
import path from "node:path";

import { ImageResponse } from "next/og";

import prisma from "@lib/prisma";

/**
 * Share-preview image for an album's library page (1200×630): the cover,
 * the title in the algoRhythm 8-bit face, "dug N times" and the latest note.
 * Only for albums in the library, like the page itself.
 */
export const runtime = "nodejs";
export const revalidate = 3600;

const SIZE = { width: 1200, height: 630 };
const COVER_HOSTS =
  /(^|\.)(coverartarchive\.org|archive\.org|scdn\.co|discogs\.com)$/;

/** The cover as a data URI (JPEG/PNG only: the renderer can't draw WebP). */
const coverData = async (url: string | null) => {
  if (!url) return null;
  try {
    if (!COVER_HOSTS.test(new URL(url).hostname)) return null;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "algoRhythm/0.1 (+https://github.com/everyonesradio/algorhythm)",
      },
      signal: AbortSignal.timeout(6000),
    });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/^image\/(jpeg|png)/.test(type)) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > 4 * 1024 * 1024) return null;
    return `data:${type.split(";")[0]};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
};

/** Fonts, read once per instance (bundled via outputFileTracingIncludes). */
let fonts: Promise<{ display: Buffer; body: Buffer }> | null = null;
const loadFonts = () =>
  (fonts ??= Promise.all([
    readFile(path.join(process.cwd(), "public/fonts/EightBitDragon-anqx.ttf")),
    readFile(
      path.join(
        process.cwd(),
        "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf"
      )
    ),
  ]).then(([display, body]) => ({ display, body })));

const clip = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n - 1)}…` : s;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!/^[a-f\d]{24}$/i.test(id))
    return new Response("Not found", { status: 404 });

  const album = await prisma.album.findUnique({
    where: { id },
    select: {
      title: true,
      artist: true,
      releaseYear: true,
      coverUrl: true,
      libraryCount: true,
    },
  });
  if (!album?.libraryCount) return new Response("Not found", { status: 404 });

  const latest = await prisma.libraryEntry.findFirst({
    where: { albumId: id, hidden: false },
    orderBy: { createdAt: "desc" },
    select: { note: true, coverUrl: true },
  });
  const [cover, fontFiles] = await Promise.all([
    coverData(latest?.coverUrl ?? album.coverUrl),
    loadFonts().catch(() => null),
  ]);
  const dug =
    album.libraryCount === 1 ? "Dug once" : `Dug ${album.libraryCount} times`;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        gap: 56,
        padding: 64,
        background: "#f4f0e8",
        color: "#111",
        fontFamily: "Geist",
      }}
    >
      <div
        style={{
          width: 480,
          height: 480,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1a1a1a",
          borderRadius: 6,
          boxShadow: "18px 24px 40px rgba(0,0,0,0.35)",
          overflow: "hidden",
        }}
      >
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            width={480}
            height={480}
            style={{ objectFit: "cover" }}
            alt=''
          />
        ) : (
          <div
            style={{
              width: 160,
              height: 160,
              borderRadius: 999,
              background: "#c9c1b2",
            }}
          />
        )}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 18,
          flex: 1,
          minWidth: 0,
        }}
      >
        <div
          style={{
            fontSize: 22,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: "rgba(0,0,0,0.5)",
          }}
        >
          {`${dug} · The Library`}
        </div>
        <div
          style={{
            fontSize: album.title.length > 24 ? 52 : 68,
            lineHeight: 1.05,
            fontFamily: fontFiles ? "EightBitDragon" : undefined,
          }}
        >
          {clip(album.title, 48)}
        </div>
        <div style={{ fontSize: 34, fontWeight: 600 }}>
          {`${clip(album.artist, 40)}${album.releaseYear ? ` · ${album.releaseYear}` : ""}`}
        </div>
        {latest?.note && (
          <div
            style={{
              fontSize: 26,
              fontStyle: "italic",
              color: "rgba(0,0,0,0.7)",
              marginTop: 8,
            }}
          >
            {`“${clip(latest.note, 110)}”`}
          </div>
        )}
        <div
          style={{
            fontSize: 24,
            marginTop: "auto",
            color: "rgba(0,0,0,0.55)",
            fontFamily: fontFiles ? "EightBitDragon" : undefined,
          }}
        >
          algoRhythm
        </div>
      </div>
    </div>,
    {
      ...SIZE,
      // Body text in Geist; the title and the mark in the algoRhythm 8-bit face.
      fonts: fontFiles
        ? [
            { name: "Geist", data: fontFiles.body, style: "normal" as const },
            {
              name: "EightBitDragon",
              data: fontFiles.display,
              style: "normal" as const,
            },
          ]
        : [],
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    }
  );
}
