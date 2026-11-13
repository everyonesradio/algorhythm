// ** React/Next.js Imports
import Link from "next/link";
import React from "react";

// ** Third-Party Imports
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { AnimatePresence, motion } from "motion/react";

// ** Custom Components, Hooks, Utils, etc.
import AlbumDetails from "@/components/album-details";
import LibraryCta from "@/components/library-cta";
import StreamingLinks from "@/components/streaming-links";
import Sheet from "@/components/sheet";
import Vinyl3D from "@/components/vinyl-cover";
import type { VinylAlbum } from "@/types/api";

// ** Icon Imports
import { IoClose } from "react-icons/io5";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Fires once the close animation finishes; clear the album data here. */
  onExitComplete?: () => void;
  album: VinylAlbum;
  /** The cover the user scanned, when it's an alternative (another pressing). */
  coverUrl?: string;
  confirmed?: boolean;
  /** The scan that identified this record; enables "Add to library". */
  scanId?: string | null;
  /** Adding to the library also confirms the record. */
  onAddedToLibrary?: () => void;
  /** Link to the album's shareable page, when it has one. */
  pageHref?: string;
  onConfirm?: () => void;
  onReject?: () => void;
}

const DigitalAlbum: React.FC<Props> = ({
  open,
  onClose,
  onExitComplete,
  album,
  coverUrl,
  confirmed,
  scanId,
  onAddedToLibrary,
  pageHref,
  onConfirm,
  onReject,
}) => {
  // Discogs styles are the most specific ("Boom Bap"), then MB genres/tags.
  const seen = new Set<string>();
  const chips = [...(album.styles ?? []), ...album.genres, ...album.tags]
    .filter((v) => {
      // "Boom Bap" (Discogs) and "boom bap" (MusicBrainz) are one chip.
      const key = v.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      onExitComplete={onExitComplete}
      label={`${album.title} by ${album.artist}`}
    >
      <div className='relative flex w-full flex-col items-center'>
        <button
          aria-label='Close'
          className='absolute end-0 top-0 flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-[transform,background-color] duration-[120ms] hover:bg-gray-100 active:scale-[0.97]'
          onClick={onClose}
        >
          <IoClose size={22} />
        </button>

        <div className='flex flex-col items-center px-8 text-center'>
          <h2 className='font-eightbitdragon text-lg sm:text-2xl'>
            {album.title}
          </h2>
          <span className='font-medium'>
            {album.artist}
            {album.releaseYear ? ` · ${album.releaseYear}` : ""}
          </span>
          {album.labels[0] && (
            <span className='text-sm text-gray-500'>{album.labels[0]}</span>
          )}
          {chips.length > 0 && (
            <div className='mt-2 flex flex-wrap justify-center gap-1'>
              {chips.map((g) => (
                <span
                  key={g}
                  className='rounded-full bg-gray-100 px-2 py-0.5 text-xs capitalize text-gray-700'
                >
                  {g}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className='h-[340px] w-full sm:h-[440px]'>
          <Canvas camera={{ position: [0, 0, 2.4], fov: 75 }}>
            <pointLight position={[10, 10, 10]} />
            <Vinyl3D coverArt={coverUrl ?? album.coverUrl} />
            <OrbitControls makeDefault />
          </Canvas>
        </div>

        {/* Once answered, the question just goes away. */}
        <AnimatePresence initial={false}>
          {(onConfirm || onReject) && !confirmed && (
            <motion.div
              key='ask'
              className='overflow-hidden'
              initial={false}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18 }}
            >
              <div className='mb-4 flex h-8 items-center gap-2 text-sm'>
                <div className='flex items-center gap-2'>
                  <span className='text-gray-600'>Right record?</span>
                  {onConfirm && (
                    <button
                      className='rounded-full border border-black px-3 py-1 transition-transform duration-[120ms] active:scale-[0.97]'
                      onClick={onConfirm}
                    >
                      Yes
                    </button>
                  )}
                  {onReject && (
                    <button
                      className='rounded-full border border-gray-300 px-3 py-1 text-gray-700 transition-transform duration-[120ms] active:scale-[0.97]'
                      onClick={onReject}
                    >
                      No, show others
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className='flex w-full max-w-sm flex-col gap-3'>
          {/* Only a record a scan identified (matched, confirmed or
              entered by hand) can go into the library. */}
          {scanId && (
            <LibraryCta
              albumId={album.id}
              scanId={scanId}
              coverUrl={coverUrl}
              onAdded={onAddedToLibrary}
              pageHref={pageHref}
            />
          )}
          <StreamingLinks album={album} />
        </div>
        {pageHref && !scanId && (
          <Link
            href={pageHref}
            className='mt-4 text-sm font-medium underline underline-offset-4'
          >
            Open the album page
          </Link>
        )}
        <AlbumDetails albumId={album.id} />
      </div>
    </Sheet>
  );
};

export default DigitalAlbum;
