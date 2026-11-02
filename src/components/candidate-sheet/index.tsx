// ** React/Next.js Imports
import React, { useEffect, useState } from "react";

// ** Third-Party Imports
import { ArrowLeft, Loader2, Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

// ** Custom Components, Hooks, Utils, etc.
import Sheet from "@/components/sheet";
import type { VinylMatch } from "@/types/api";
import { rankCoversByScan } from "@/utils/rank-covers";
import { api } from "@/utils/trpc";

type Artist = { name: string; mbid: string };

interface Props {
  open: boolean;
  /** Albums the scan was unsure between (may be empty). */
  matches: VinylMatch[];
  /** Artists of the nearest covers, for "Is it by one of these?". */
  artistSuggestions: Artist[];
  /** The scan's own vector; ranks an artist's records by cover likeness. */
  scanVector: number[] | null;
  /** The on-device embedder (same model as the scanner). */
  embed: (image: ImageData) => Promise<number[]>;
  onPickMatch: (index: number) => void;
  /** Picked from an artist's discography (MusicBrainz release group id). */
  onPickRecord: (mbid: string) => Promise<void>;
  onDismiss: () => void;
  /** Fires once the close animation finishes; clear the data here. */
  onExitComplete?: () => void;
}

const list = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04, delayChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", bounce: 0.15, duration: 0.3 },
  },
} as const;
const swap = {
  initial: { opacity: 0, x: 12 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -12 },
  transition: { duration: 0.18 },
};

/** Wait for typing to pause before searching MusicBrainz. */
const useDebounced = <T,>(value: T, ms: number) => {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
};

/** Cover thumbnail that degrades to a plain tile if there's no art. */
const Thumb = ({
  src,
  title,
  eager = false,
}: {
  src: string;
  title: string;
  /** Only a few rows are on screen; load them right away. */
  eager?: boolean;
}) => {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <div className='flex aspect-square w-full items-center justify-center rounded-md bg-gray-200 p-2 text-center text-[11px] leading-tight text-gray-500'>
      {title}
    </div>
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=''
      loading={eager ? "eager" : "lazy"}
      onError={() => setFailed(true)}
      className='aspect-square w-full rounded-md bg-gray-100 object-cover'
    />
  );
};

/** How many of an artist's records to suggest before "See all". */
const SUGGESTED = 3;

type Release = {
  mbid: string;
  title: string;
  year: number | null;
  type: string | null;
  thumbUrl: string;
  albumId: string | null;
};

const ReleaseRow = ({
  r,
  onPick,
  picking,
}: {
  r: Release;
  onPick: (mbid: string) => void;
  picking: string | null;
}) => (
  <button
    className='flex w-full items-center gap-3 rounded-lg p-2 text-left transition-[transform,background-color] duration-[120ms] hover:bg-gray-100 active:scale-[0.98] disabled:opacity-50'
    onClick={() => onPick(r.mbid)}
    disabled={!!picking}
  >
    <span className='relative w-14 shrink-0'>
      <Thumb src={r.thumbUrl} title={r.title} eager />
      {picking === r.mbid && (
        <span className='absolute inset-0 flex items-center justify-center rounded-md bg-white/70'>
          <Loader2 className='h-5 w-5 animate-spin' />
        </span>
      )}
    </span>
    <span className='flex min-w-0 flex-col'>
      <span className='truncate font-medium'>{r.title}</span>
      <span className='text-sm text-gray-600'>
        {[r.year, r.type === "EP" ? "EP" : null].filter(Boolean).join(" · ")}
      </span>
    </span>
  </button>
);

/**
 * The artist's records as a short list: the three whose covers look most
 * like the scan (ranked on the device), with "See all" as the escape hatch.
 */
const Discography = ({
  artist,
  onPick,
  picking,
  scanVector,
  embed,
}: {
  artist: Artist;
  onPick: (mbid: string) => void;
  picking: string | null;
  scanVector: number[] | null;
  embed: (image: ImageData) => Promise<number[]>;
}) => {
  const { data, isLoading, isError } = api.vinyl.discography.useQuery(
    { artistMbid: artist.mbid },
    { staleTime: 60 * 60 * 1000 }
  );
  const [ranked, setRanked] = useState<Release[] | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    // Without a scan vector the list stays newest-first (derived below).
    if (!data || !scanVector) return;
    const ctrl = new AbortController();
    rankCoversByScan(data, scanVector, embed, { signal: ctrl.signal })
      .then((top) => {
        if (ctrl.signal.aborted) return;
        // Ranked covers first, then the rest of the discography as listed.
        const seen = new Set(top.map((t) => t.mbid));
        setRanked([...top, ...data.filter((d) => !seen.has(d.mbid))]);
      })
      .catch(() => !ctrl.signal.aborted && setRanked(data));
    return () => ctrl.abort();
  }, [data, scanVector, embed]);

  if (isError) {
    return (
      <p className='py-6 text-center text-sm text-gray-600'>
        Couldn&apos;t load {artist.name}&apos;s records. Try again in a moment.
      </p>
    );
  }
  // Show newest-first right away; re-order once the on-device ranking
  // finishes (it fetches and embeds each thumbnail, which takes a moment).
  const ordered = ranked ?? data ?? null;
  const sorting = !!scanVector && !!data && !ranked;
  if (isLoading || !data || !ordered) {
    return (
      <div className='flex flex-col gap-2' aria-busy>
        <p className='text-xs text-gray-500'>Loading records…</p>
        {Array.from({ length: SUGGESTED }, (_, i) => (
          <div key={i} className='flex items-center gap-3 p-2'>
            <div className='h-14 w-14 animate-pulse rounded-md bg-gray-200' />
            <div className='h-4 w-1/2 animate-pulse rounded bg-gray-200' />
          </div>
        ))}
      </div>
    );
  }
  if (ordered.length === 0) {
    return (
      <p className='py-6 text-center text-sm text-gray-600'>
        No albums or EPs listed for {artist.name} yet.
      </p>
    );
  }
  const visible = showAll ? ordered : ordered.slice(0, SUGGESTED);
  return (
    <div className='flex flex-col gap-1'>
      <p className='h-4 text-xs text-gray-500' aria-live='polite'>
        {sorting
          ? "Sorting by closest cover…"
          : ranked
            ? "Closest covers first"
            : ""}
      </p>
      <motion.ul
        className='flex flex-col gap-1'
        variants={list}
        initial='hidden'
        animate='show'
      >
        {visible.map((r) => (
          // `layout` slides rows into their new place when the ranking lands.
          <motion.li key={r.mbid} variants={item} layout='position'>
            <ReleaseRow r={r} onPick={onPick} picking={picking} />
          </motion.li>
        ))}
      </motion.ul>
      {!showAll && ordered.length > SUGGESTED && (
        <button
          className='self-start px-2 py-2 text-sm text-gray-600 underline underline-offset-4'
          onClick={() => setShowAll(true)}
        >
          Not these? See all {ordered.length} records
        </button>
      )}
    </div>
  );
};

/**
 * "Is it one of these?" picker, shown when a scan isn't certain.
 * Albums first, then artists the cover resembles (plus search). Picking a
 * record from an artist's discography adds it to the catalog with the
 * user's scan, and starts vectorising that artist's catalog.
 */
const CandidateSheet: React.FC<Props> = ({
  open,
  matches,
  artistSuggestions,
  scanVector,
  embed,
  onPickMatch,
  onPickRecord,
  onDismiss,
  onExitComplete,
}) => {
  const [artist, setArtist] = useState<Artist | null>(null);
  const [query, setQuery] = useState("");
  const [picking, setPicking] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const debounced = useDebounced(query.trim(), 350);
  const search = api.vinyl.searchArtists.useQuery(
    { query: debounced },
    { enabled: debounced.length >= 2, staleTime: 5 * 60 * 1000 }
  );

  // Warm the suggested artists' discographies so tapping one is instant.
  const utils = api.useUtils();
  useEffect(() => {
    for (const a of artistSuggestions) {
      void utils.vinyl.discography.prefetch({ artistMbid: a.mbid });
    }
  }, [artistSuggestions, utils]);

  const pickRecord = async (mbid: string) => {
    setPicking(mbid);
    setPickError(null);
    try {
      await onPickRecord(mbid);
    } catch {
      setPickError("Couldn't add that record. Please try again.");
    } finally {
      setPicking(null);
    }
  };

  const chip =
    "rounded-full border border-gray-300 px-3 py-1.5 text-sm transition-[transform,background-color] duration-[120ms] hover:bg-gray-100 active:scale-[0.97]";

  return (
    <Sheet
      open={open}
      onClose={onDismiss}
      onExitComplete={onExitComplete}
      label={artist ? `Records by ${artist.name}` : "Possible matches"}
    >
      <AnimatePresence mode='wait' initial={false}>
        {artist ? (
          <motion.div key='artist' className='flex flex-col gap-4' {...swap}>
            <div className='flex items-center gap-2'>
              <button
                aria-label='Back'
                className='flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-100'
                onClick={() => setArtist(null)}
              >
                <ArrowLeft className='h-5 w-5' />
              </button>
              <div>
                <h2 className='font-semibold'>{artist.name}</h2>
                <p className='text-xs text-gray-500'>Which record is it?</p>
              </div>
            </div>
            <Discography
              artist={artist}
              onPick={pickRecord}
              picking={picking}
              scanVector={scanVector}
              embed={embed}
            />
            {pickError && (
              <p className='text-center text-sm text-red-700' role='alert'>
                {pickError}
              </p>
            )}
          </motion.div>
        ) : (
          <motion.div key='main' className='flex flex-col gap-5' {...swap}>
            {matches.length > 0 && (
              <section className='flex flex-col gap-2'>
                <div className='flex items-center justify-between'>
                  <h2 className='font-semibold'>Is it one of these?</h2>
                  <button className='text-sm text-gray-500' onClick={onDismiss}>
                    Keep scanning
                  </button>
                </div>
                <motion.ul
                  className='flex flex-col gap-1'
                  variants={list}
                  initial='hidden'
                  animate='show'
                >
                  {matches.slice(0, SUGGESTED).map((m, i) => (
                    <motion.li key={m.album.id} variants={item}>
                      <button
                        className='flex w-full items-center gap-3 rounded-lg p-2 text-left transition-[transform,background-color] duration-[120ms] hover:bg-gray-100 active:scale-[0.98]'
                        onClick={() => onPickMatch(i)}
                      >
                        <span className='w-14 shrink-0'>
                          <Thumb
                            src={m.album.coverUrl}
                            title={m.album.title}
                            eager
                          />
                        </span>
                        <span className='flex flex-col'>
                          <span className='font-medium'>{m.album.title}</span>
                          <span className='text-sm text-gray-600'>
                            {m.album.artist}
                            {m.album.releaseYear
                              ? ` · ${m.album.releaseYear}`
                              : ""}
                          </span>
                        </span>
                      </button>
                    </motion.li>
                  ))}
                </motion.ul>
              </section>
            )}

            <section className='flex flex-col gap-3'>
              <div className='flex items-center justify-between'>
                <h2 className='font-semibold'>
                  {matches.length > 0
                    ? "Not here? Is it by…"
                    : "Not sure yet. Is it by…"}
                </h2>
                {matches.length === 0 && (
                  <button className='text-sm text-gray-500' onClick={onDismiss}>
                    Keep scanning
                  </button>
                )}
              </div>
              {artistSuggestions.length > 0 && (
                <div className='flex flex-wrap gap-2'>
                  {artistSuggestions.map((a) => (
                    <button
                      key={a.mbid}
                      className={chip}
                      onClick={() => setArtist(a)}
                    >
                      {a.name}
                    </button>
                  ))}
                </div>
              )}
              <label className='relative block'>
                <span className='sr-only'>Search for the artist</span>
                <Search className='pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400' />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={
                    artistSuggestions.length
                      ? "Someone else? Search artist"
                      : "Search artist"
                  }
                  // 16px stops iOS zooming in on focus.
                  className='h-12 w-full rounded-full border-2 border-gray-200 bg-white pl-10 pr-4 text-base focus:border-black focus:outline-none'
                />
              </label>
              {debounced.length >= 2 && (
                <div aria-live='polite'>
                  {search.isLoading ? (
                    <div className='flex justify-center py-3'>
                      <Loader2 className='h-5 w-5 animate-spin text-gray-400' />
                    </div>
                  ) : search.data && search.data.length > 0 ? (
                    <ul className='flex flex-col'>
                      {search.data.map((a) => (
                        <li key={a.mbid}>
                          <button
                            className='flex w-full items-baseline gap-2 rounded-lg px-3 py-2.5 text-left hover:bg-gray-100'
                            onClick={() =>
                              setArtist({ name: a.name, mbid: a.mbid })
                            }
                          >
                            <span className='font-medium'>{a.name}</span>
                            {a.detail && (
                              <span className='text-xs text-gray-500'>
                                {a.detail}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className='px-3 py-2 text-sm text-gray-500'>
                      No artists found for &ldquo;{debounced}&rdquo;.
                    </p>
                  )}
                </div>
              )}
            </section>
          </motion.div>
        )}
      </AnimatePresence>
    </Sheet>
  );
};

export default CandidateSheet;
