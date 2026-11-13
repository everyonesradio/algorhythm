// ** React/Next.js Imports
import type { GetServerSideProps } from "next";
import dynamic from "next/dynamic";
import Head from "next/head";
import Link from "next/link";
import React, { useState } from "react";

// ** Custom Components, Hooks, Utils, etc.
import prisma from "@lib/prisma";
import AlbumDetails from "@/components/album-details";
import { dugTimes } from "@/components/library-card";
import StreamingLinks from "@/components/streaming-links";
import { albumSelect } from "@/server/api/album-select";
import type { VinylAlbum } from "@/types/api";
import { albumIdFromSlug, albumPath } from "@/utils/album-path";

// ** Icon Imports
import { IoArrowBack, IoCameraOutline, IoShareOutline } from "react-icons/io5";

/** The 3D sleeve is client-only (WebGL). */
const Sleeve3D = dynamic(() => import("@/components/sleeve-3d"), {
  ssr: false,
  loading: () => (
    <div className='aspect-square w-full max-w-[420px] animate-pulse rounded-md bg-black/5' />
  ),
});

type Props = {
  album: VinylAlbum;
  count: number;
  /** The art most recently scanned for this album (a pressing), if any. */
  coverUrl: string | null;
  url: string;
  ogImage: string;
};

/** First find's note, for the share description. */
const describe = (album: VinylAlbum, count: number) =>
  `${album.title} by ${album.artist}${album.releaseYear ? ` (${album.releaseYear})` : ""}. ${dugTimes(count)} by crate diggers on algoRhythm: listen on every streaming app, read the notes, see the tracklist.`;

/**
 * An album's shareable page in the public library: the record, its
 * streaming links, recent notes, a little about it and its tracklist.
 * Rendered on the server so shared links get a proper preview.
 */
const AlbumPage = ({ album, count, coverUrl, url, ogImage }: Props) => {
  const [shared, setShared] = useState<"copied" | "failed" | null>(null);
  const title = `${album.title} by ${album.artist} · The Library · algoRhythm`;
  const description = describe(album, count);

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${album.title} by ${album.artist}`,
          url,
        });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShared("copied");
    } catch (err) {
      // Closing the share sheet isn't a failure.
      if ((err as Error).name !== "AbortError") setShared("failed");
    }
  };

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name='description' content={description} />
        <link rel='canonical' href={url} />
        <meta property='og:type' content='music.album' />
        <meta
          property='og:title'
          content={`${album.title} by ${album.artist}`}
        />
        <meta property='og:description' content={description} />
        <meta property='og:url' content={url} />
        <meta property='og:image' content={ogImage} />
        <meta property='og:image:width' content='1200' />
        <meta property='og:image:height' content='630' />
        <meta name='twitter:card' content='summary_large_image' />
      </Head>
      <main className='min-h-dvh bg-[#f4f0e8] pb-16 text-[#111]'>
        <div className='mx-auto flex max-w-5xl flex-col gap-8 px-4 pt-14 sm:px-6'>
          <nav className='flex items-center justify-between'>
            <Link
              href='/library'
              className='flex items-center gap-1.5 text-sm text-black/70 hover:text-black'
            >
              <IoArrowBack /> The Library
            </Link>
            <button
              type='button'
              onClick={() => void share()}
              className='flex items-center gap-1.5 rounded-full border border-black/20 px-3 py-1.5 text-sm transition-colors hover:border-black'
            >
              <IoShareOutline />
              {shared === "copied" ? "Link copied" : "Share"}
            </button>
          </nav>
          {shared === "failed" && (
            <p role='alert' className='-mt-4 text-right text-xs text-black/60'>
              Couldn&apos;t share. Copy the address from your browser instead.
            </p>
          )}

          <div className='grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-12'>
            <div className='flex flex-col items-center gap-6 md:sticky md:top-8 md:self-start'>
              <div className='aspect-square w-full max-w-[420px]'>
                <Sleeve3D coverArt={coverUrl ?? album.coverUrl} />
              </div>
            </div>

            <div className='flex min-w-0 flex-col gap-6'>
              <header className='flex flex-col gap-2'>
                <span className='text-[11px] font-semibold uppercase tracking-[0.16em] text-black/50'>
                  {dugTimes(count)} · The Library
                </span>
                <h1 className='font-eightbitdragon text-3xl leading-tight sm:text-4xl'>
                  {album.title}
                </h1>
                <p className='text-lg font-medium'>
                  {album.artist}
                  {album.releaseYear ? ` · ${album.releaseYear}` : ""}
                </p>
                {album.labels[0] && (
                  <p className='text-sm text-black/55'>{album.labels[0]}</p>
                )}
              </header>

              <div className='flex w-full max-w-sm flex-col gap-3'>
                <StreamingLinks album={album} />
              </div>

              <AlbumDetails albumId={album.id} />

              <aside className='flex max-w-sm flex-col gap-3 rounded-2xl bg-white/70 p-5 ring-1 ring-black/5'>
                <p className='font-semibold'>Found a copy too?</p>
                <p className='text-sm text-black/65'>
                  Scan it with algoRhythm and add your find to the library, with
                  a note about where it turned up.
                </p>
                <Link
                  href='/scan-vinyl'
                  className='flex items-center justify-center gap-2 rounded-full bg-black px-4 py-2.5 text-sm font-medium text-white transition-transform duration-[120ms] active:scale-[0.97]'
                >
                  <IoCameraOutline className='text-lg' />
                  Scan a record
                </Link>
              </aside>
            </div>
          </div>
        </div>
      </main>
    </>
  );
};

export const getServerSideProps: GetServerSideProps<Props> = async ({
  params,
  req,
  res,
}) => {
  const slug = String(params?.slug ?? "");
  const id = albumIdFromSlug(slug);
  if (!id) return { notFound: true };

  const album = await prisma.album.findUnique({
    where: { id },
    select: { ...albumSelect, libraryCount: true },
  });
  // Only records people have actually added have a public page.
  if (!album || !album.libraryCount) return { notFound: true };

  // One canonical address per album, whatever the slug said.
  const path = albumPath(album);
  if (`/library/${slug}` !== path) {
    return { redirect: { destination: path, permanent: false } };
  }

  const latest = await prisma.libraryEntry.findFirst({
    where: { albumId: id, hidden: false, coverUrl: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { coverUrl: true },
  });

  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0] ??
    "http";
  const origin = `${proto}://${req.headers.host}`;
  // Fresh enough for finds and notes; cheap for repeat visits.
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=60, stale-while-revalidate=300"
  );

  const { libraryCount, ...rest } = album;
  return {
    props: {
      album: rest as VinylAlbum,
      count: libraryCount,
      coverUrl: latest?.coverUrl ?? null,
      url: `${origin}${path}`,
      ogImage: `${origin}/api/og/album/${id}`,
    },
  };
};

export default AlbumPage;
