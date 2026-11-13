// ** React/Next.js Imports
import React from "react";

/** "Dug once", "Dug 4 times". */
export const dugTimes = (count: number) =>
  count === 1 ? "Dug once" : `Dug ${count} times`;

interface Props {
  title: string;
  artist: string;
  year: number | null;
  coverUrl: string | null;
  count: number;
  latestNote: string | null;
  onOpen: () => void;
}

/**
 * One record in the library grid: the sleeve tilted in CSS 3D (no WebGL, so
 * a whole grid stays light on a phone), straightening when you hover or
 * focus it.
 */
const LibraryCard: React.FC<Props> = ({
  title,
  artist,
  year,
  coverUrl,
  count,
  latestNote,
  onOpen,
}) => (
  <button
    type='button'
    onClick={onOpen}
    className='group flex min-w-0 flex-col gap-3 rounded-2xl p-2 text-left outline-none transition-colors duration-150 hover:bg-black/[0.04] focus-visible:ring-2 focus-visible:ring-black'
    aria-label={`${title} by ${artist}, ${dugTimes(count).toLowerCase()}`}
  >
    <div className='aspect-square w-full [perspective:900px]'>
      <div className='h-full w-full rounded-[4px] bg-[#d9d3c7] shadow-[10px_14px_24px_-10px_rgba(0,0,0,0.45)] transition-transform duration-300 ease-out [transform:rotateY(-14deg)_rotateX(4deg)] group-hover:[transform:rotateY(-4deg)_rotateX(1deg)] group-focus-visible:[transform:rotateY(-4deg)_rotateX(1deg)] motion-reduce:transition-none'>
        {!coverUrl && (
          // No artwork anywhere (some records entered by hand): a plain record.
          <div className='flex h-full w-full items-center justify-center'>
            <div className='flex aspect-square w-3/4 items-center justify-center rounded-full bg-[#1a1a1a]'>
              <div className='aspect-square w-1/3 rounded-full bg-[#c9c1b2]' />
            </div>
          </div>
        )}
        {coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- covers come from several CDNs
          <img
            src={coverUrl}
            alt=''
            loading='lazy'
            decoding='async'
            className='h-full w-full rounded-[4px] object-cover'
          />
        )}
      </div>
    </div>
    <div className='flex min-w-0 flex-col gap-0.5 px-1'>
      <span className='truncate text-sm font-semibold'>{title}</span>
      <span className='truncate text-xs text-black/60'>
        {artist}
        {year ? ` · ${year}` : ""}
      </span>
      <span className='mt-1 text-[11px] font-medium uppercase tracking-[0.08em] text-black/45'>
        {dugTimes(count)}
      </span>
      {latestNote && (
        <span className='line-clamp-2 text-xs italic text-black/70'>
          “{latestNote}”
        </span>
      )}
    </div>
  </button>
);

export default LibraryCard;
