// ** React/Next.js Imports
import React from "react";

// ** Third-Party Imports
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

// ** Custom Components, Hooks, Utils, etc.
import SearchCard from "@/components/search-card";
import Sheet from "@/components/sheet";
import Vinyl3D from "@/components/vinyl-cover";
import type { VinylAlbum } from "@/types/api";
import { api } from "@/utils/trpc";

// ** Icon Imports
import { FaSpotify } from "react-icons/fa6";
import { IoClose } from "react-icons/io5";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Fires once the close animation finishes; clear the album data here. */
  onExitComplete?: () => void;
  album: VinylAlbum;
  confirmed?: boolean;
  onConfirm?: () => void;
  onReject?: () => void;
}

const fade = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0 },
  transition: { duration: 0.18 },
};

const DigitalAlbum: React.FC<Props> = ({
  open,
  onClose,
  onExitComplete,
  album,
  confirmed,
  onConfirm,
  onReject,
}) => {
  // Cached on the album server-side; only albums with a Spotify match can be
  // resolved to the other platforms.
  const { data: linkData, isError } = api.vinyl.links.useQuery(
    { albumId: album.id },
    { enabled: !!album.spotifyUrl, retry: 1, staleTime: Infinity }
  );
  const links = linkData?.links ?? null;
  const showSpotifyFallback =
    !album.spotifyUrl || isError || (linkData !== undefined && !links);

  const spotifySearchUrl = `https://open.spotify.com/search/${encodeURIComponent(
    `${album.artist} ${album.title}`
  )}`;
  const chips = [...album.genres, ...album.tags]
    .filter((v, i, arr) => arr.indexOf(v) === i)
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

        <div className='h-[300px] w-full sm:h-[400px]'>
          <Canvas camera={{ position: [0, 0, 3], fov: 75 }}>
            <pointLight position={[10, 10, 10]} />
            <Vinyl3D coverArt={album.coverUrl} />
            <OrbitControls makeDefault />
          </Canvas>
        </div>

        {(onConfirm || onReject) && (
          <div className='mb-4 flex h-8 items-center gap-2 text-sm'>
            <AnimatePresence mode='wait' initial={false}>
              {confirmed ? (
                <motion.span key='thanks' className='text-gray-600' {...fade}>
                  Thanks, noted.
                </motion.span>
              ) : (
                <motion.div
                  key='ask'
                  className='flex items-center gap-2'
                  {...fade}
                >
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
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        <div className='w-full max-w-sm'>
          {showSpotifyFallback ? (
            <a
              href={album.spotifyUrl ?? spotifySearchUrl}
              target='_blank'
              rel='noreferrer'
              className='flex w-full items-center space-x-2 rounded-full bg-black p-2 px-4 text-white transition-transform duration-[120ms] active:scale-[0.97]'
            >
              <FaSpotify className='text-lg' />
              <span>
                {album.spotifyUrl ? "Listen on Spotify" : "Find on Spotify"}
              </span>
            </a>
          ) : !links ? (
            <div className='flex items-center justify-center py-6'>
              <Loader2 className='h-8 w-8 animate-spin text-black' />
            </div>
          ) : (
            <SearchCard searchResult={links} />
          )}
        </div>
      </div>
    </Sheet>
  );
};

export default DigitalAlbum;
