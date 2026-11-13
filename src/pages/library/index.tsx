// ** React/Next.js Imports
import Head from "next/head";
import Link from "next/link";
import React, { useState } from "react";

// ** Third-Party Imports
import { Loader2 } from "lucide-react";

// ** Custom Components, Hooks, Utils, etc.
import DigitalAlbum from "@/components/digital-album";
import LibraryCard from "@/components/library-card";
import type { VinylAlbum } from "@/types/api";
import { albumPath } from "@/utils/album-path";
import { api } from "@/utils/trpc";

// ** Icon Imports
import { IoCameraOutline } from "react-icons/io5";

type Sort = "recent" | "most";

const Chip = ({
  active,
  onClick,
  children,
  capitalize = false,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  /** Genres from MusicBrainz are lower case ("contemporary r&b"). */
  capitalize?: boolean;
}) => (
  <button
    type='button'
    aria-pressed={active}
    onClick={onClick}
    className={`shrink-0 rounded-full border px-3 py-1 text-sm transition-colors duration-150 ${
      active
        ? "border-black bg-black text-white"
        : "border-black/15 bg-white/60 text-black/75 hover:border-black/40"
    } ${capitalize ? "capitalize" : ""}`}
  >
    {children}
  </button>
);

/**
 * The Library: every record people have scanned and added, worldwide. Open
 * and anonymous. Tap a record for its streaming links, recent notes,
 * tracklist and a little about it.
 */
const LibraryPage = () => {
  const [sort, setSort] = useState<Sort>("recent");
  const [genre, setGenre] = useState<string | null>(null);
  const [decade, setDecade] = useState<number | null>(null);
  const [selected, setSelected] = useState<VinylAlbum | null>(null);
  const [open, setOpen] = useState(false);

  const stats = api.library.stats.useQuery(undefined, { staleTime: 60_000 });
  const events = api.events.list.useQuery(undefined, { staleTime: 60_000 });
  const facets = api.library.facets.useQuery(undefined, { staleTime: 300_000 });
  const list = api.library.list.useInfiniteQuery(
    { sort, genre, decade, limit: 24 },
    {
      getNextPageParam: (last) => last.nextOffset ?? undefined,
      staleTime: 30_000,
    }
  );
  // Offset paging can repeat a record if a new find lands meanwhile.
  const items = (list.data?.pages.flatMap((p) => p.items) ?? []).filter(
    (item, i, all) => all.findIndex((x) => x.album.id === item.album.id) === i
  );
  const filtered = !!genre || decade !== null;

  return (
    <>
      <Head>
        <title>The Library · algoRhythm</title>
        <meta
          name='description'
          content='Every record crate diggers have scanned with algoRhythm, from shops, fairs and flea markets worldwide.'
        />
      </Head>
      <main className='min-h-dvh bg-[#f4f0e8] pb-16 text-[#111]'>
        <div className='mx-auto flex max-w-6xl flex-col gap-8 px-4 pt-10 sm:px-6 sm:pt-14'>
          <header className='flex flex-wrap items-end justify-between gap-6'>
            <div className='flex max-w-xl flex-col gap-3'>
              <span className='text-[11px] font-semibold uppercase tracking-[0.2em] text-black/50'>
                Public library
              </span>
              <h1 className='font-eightbitdragon text-3xl sm:text-5xl'>
                The Library
              </h1>
              <p className='text-black/70'>
                Every record diggers have scanned and added, from record shops,
                fairs and flea markets. No accounts, no names: just the records
                and the odd note about where they turned up.
              </p>
              {stats.data && stats.data.records > 0 && (
                <p className='text-sm tabular-nums text-black/55'>
                  {stats.data.records.toLocaleString()}{" "}
                  {stats.data.records === 1 ? "record" : "records"} ·{" "}
                  {stats.data.finds.toLocaleString()}{" "}
                  {stats.data.finds === 1 ? "find" : "finds"}
                </p>
              )}
            </div>
            <Link
              href='/scan-vinyl'
              className='flex items-center gap-2 rounded-full bg-black px-4 py-2.5 text-sm font-medium text-white transition-transform duration-[120ms] active:scale-[0.97]'
            >
              <IoCameraOutline className='text-lg' />
              Scan a record
            </Link>
          </header>

          {(events.data?.length ?? 0) > 0 && (
            <section aria-labelledby='popups' className='flex flex-col gap-3'>
              <h2
                id='popups'
                className='text-[11px] font-semibold uppercase tracking-[0.18em] text-black/55'
              >
                Pop-ups
              </h2>
              <ul className='-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0'>
                {events.data!.map((e) => (
                  <li key={e.slug} className='shrink-0'>
                    <Link
                      href={`/library/event/${e.slug}`}
                      className='flex w-60 flex-col gap-1 rounded-2xl bg-white/70 p-4 ring-1 ring-black/5 transition-colors hover:ring-black/30'
                    >
                      <span
                        className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] ${
                          e.status === "live"
                            ? "text-emerald-700"
                            : "text-black/50"
                        }`}
                      >
                        {e.status === "live" && (
                          <span className='h-2 w-2 animate-pulse rounded-full bg-emerald-600 motion-reduce:animate-none' />
                        )}
                        {e.status === "live"
                          ? "Live now"
                          : e.status === "upcoming"
                            ? new Date(e.startsAt).toLocaleDateString("en-GB", {
                                day: "numeric",
                                month: "short",
                              })
                            : "Ended"}
                      </span>
                      <span className='truncate font-semibold'>{e.name}</span>
                      {(e.venue || e.city) && (
                        <span className='truncate text-sm text-black/60'>
                          {[e.venue, e.city].filter(Boolean).join(", ")}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className='flex flex-col gap-3'>
            <div className='flex gap-2' role='group' aria-label='Sort'>
              <Chip
                active={sort === "recent"}
                onClick={() => setSort("recent")}
              >
                Recent
              </Chip>
              <Chip active={sort === "most"} onClick={() => setSort("most")}>
                Most dug
              </Chip>
            </div>
            {(facets.data?.genres.length ?? 0) > 0 && (
              <div
                className='-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0'
                role='group'
                aria-label='Genre'
              >
                {facets.data!.genres.map((g) => (
                  <Chip
                    key={g}
                    capitalize
                    active={genre === g}
                    onClick={() => setGenre(genre === g ? null : g)}
                  >
                    {g}
                  </Chip>
                ))}
              </div>
            )}
            {(facets.data?.decades.length ?? 0) > 1 && (
              <div
                className='-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0'
                role='group'
                aria-label='Decade'
              >
                {facets.data!.decades.map((d) => (
                  <Chip
                    key={d}
                    active={decade === d}
                    onClick={() => setDecade(decade === d ? null : d)}
                  >
                    {`${d}s`}
                  </Chip>
                ))}
              </div>
            )}
          </div>

          {list.isLoading ? (
            <div className='flex justify-center py-20'>
              <Loader2 className='h-8 w-8 animate-spin' />
            </div>
          ) : list.isError ? (
            <p className='py-16 text-center text-black/60'>
              The library didn&apos;t load. Check your connection and refresh.
            </p>
          ) : items.length === 0 ? (
            <div className='flex flex-col items-center gap-3 py-16 text-center'>
              <p className='text-lg font-medium'>
                {filtered ? "Nothing here yet" : "The library is empty so far"}
              </p>
              <p className='max-w-sm text-black/60'>
                {filtered
                  ? "No one has added a record that fits these filters yet."
                  : "Scan a record, then tap Add to library to put the first one on the shelf."}
              </p>
              {filtered ? (
                <button
                  type='button'
                  className='text-sm underline underline-offset-2'
                  onClick={() => {
                    setGenre(null);
                    setDecade(null);
                  }}
                >
                  Clear filters
                </button>
              ) : (
                <Link
                  href='/scan-vinyl'
                  className='text-sm underline underline-offset-2'
                >
                  Scan a record
                </Link>
              )}
            </div>
          ) : (
            <>
              <ul className='grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6'>
                {items.map((item) => (
                  <li key={item.album.id} className='min-w-0'>
                    <LibraryCard
                      title={item.album.title}
                      artist={item.album.artist}
                      year={item.album.releaseYear}
                      coverUrl={item.coverUrl ?? item.album.coverUrl ?? null}
                      count={item.count}
                      latestNote={item.latestNote}
                      onOpen={() => {
                        setSelected(item.album);
                        setOpen(true);
                      }}
                    />
                  </li>
                ))}
              </ul>
              {list.hasNextPage && (
                <button
                  type='button'
                  onClick={() => void list.fetchNextPage()}
                  disabled={list.isFetchingNextPage}
                  className='mx-auto flex items-center gap-2 rounded-full border border-black/20 px-5 py-2 text-sm transition-colors hover:border-black disabled:opacity-60'
                >
                  {list.isFetchingNextPage && (
                    <Loader2 className='h-4 w-4 animate-spin' />
                  )}
                  Load more
                </button>
              )}
            </>
          )}
        </div>
      </main>

      {selected && (
        <DigitalAlbum
          open={open}
          onClose={() => setOpen(false)}
          onExitComplete={() => {
            if (!open) setSelected(null);
          }}
          album={selected}
          pageHref={albumPath(selected)}
        />
      )}
    </>
  );
};

export default LibraryPage;
