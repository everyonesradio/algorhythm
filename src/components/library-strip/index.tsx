// ** React/Next.js Imports
import Link from "next/link";
import React from "react";

// ** Custom Components, Hooks, Utils, etc.
import { dugTimes } from "@/components/library-card";
import { albumPath } from "@/utils/album-path";
import { api } from "@/utils/trpc";

// ** Icon Imports
import { IoArrowForward } from "react-icons/io5";

/**
 * "From the library" on the landing page: the latest records diggers added,
 * so anyone can see what people are finding before trying the app. Hidden
 * until the library has something in it.
 */
const LibraryStrip = () => {
  const { data } = api.library.list.useQuery(
    { sort: "recent", limit: 6 },
    { staleTime: 60_000 }
  );
  const items = data?.items ?? [];
  if (!items.length) return null;

  return (
    <section className='mx-auto flex max-w-5xl flex-col gap-5 px-4 pb-16 sm:px-8'>
      <div className='flex items-end justify-between gap-4'>
        <div className='flex flex-col gap-1'>
          <p className='text-xs uppercase tracking-[0.2em] text-black/50'>
            From the library
          </p>
          <h2 className='text-xl font-bold tracking-tight sm:text-2xl'>
            What diggers are finding
          </h2>
        </div>
        <Link
          href='/library'
          className='flex shrink-0 items-center gap-1 text-sm font-medium underline-offset-4 hover:underline'
        >
          Browse the library <IoArrowForward />
        </Link>
      </div>
      <ul className='-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-6 sm:overflow-visible sm:px-0'>
        {items.map(({ album, count, coverUrl }) => (
          <li key={album.id} className='w-32 shrink-0 snap-start sm:w-auto'>
            <Link
              href={albumPath(album)}
              className='group flex flex-col gap-2 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-black'
            >
              <div className='aspect-square w-full [perspective:700px]'>
                <div className='h-full w-full rounded-[4px] bg-[#d9d3c7] shadow-[8px_10px_18px_-8px_rgba(0,0,0,0.45)] transition-transform duration-300 ease-out [transform:rotateY(-14deg)] group-hover:[transform:rotateY(-3deg)] motion-reduce:transition-none'>
                  {(coverUrl ?? album.coverUrl) && (
                    // eslint-disable-next-line @next/next/no-img-element -- covers come from several CDNs
                    <img
                      src={(coverUrl ?? album.coverUrl)!}
                      alt=''
                      loading='lazy'
                      className='h-full w-full rounded-[4px] object-cover'
                    />
                  )}
                </div>
              </div>
              <span className='truncate text-sm font-semibold'>
                {album.title}
              </span>
              <span className='-mt-2 truncate text-xs text-black/55'>
                {album.artist} · {dugTimes(count).toLowerCase()}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default LibraryStrip;
