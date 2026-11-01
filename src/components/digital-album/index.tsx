// ** React/Next.js Imports
import React from "react";

// ** Third-Party Imports
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Loader2 } from "lucide-react";

// ** Custom Components, Hooks, Utils, etc.
import SearchCard from "@/components/search-card";
import Vinyl3D from "@/components/vinyl-cover";
import type { VinylAlbum } from "@/types/api";
import { api } from "@/utils/trpc";

// ** Icon Imports
import { FaSpotify } from "react-icons/fa6";
import { IoClose } from "react-icons/io5";

interface Props {
  isOpen: boolean;
  handleClose: () => void;
  album: VinylAlbum;
  confirmed?: boolean;
  onConfirm?: () => void;
  onReject?: () => void;
}

const DigitalAlbum: React.FC<Props> = ({
  isOpen,
  handleClose,
  album,
  confirmed,
  onConfirm,
  onReject,
}) => {
  const { data: searchResult, isError } = api.musicIDX.search.useQuery(
    { albumLink: album.spotifyUrl ?? "" },
    { enabled: !!album.spotifyUrl, retry: 1, staleTime: Infinity }
  );

  const spotifySearchUrl = `https://open.spotify.com/search/${encodeURIComponent(
    `${album.artist} ${album.title}`
  )}`;
  const chips = [...album.genres, ...album.tags]
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .slice(0, 5);

  return (
    <Drawer
      anchor={"bottom"}
      open={isOpen}
      onClose={handleClose}
      sx={{
        "& .MuiDrawer-paper": {
          width: "100vw",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          boxShadow: 3,
          border: "none",
        },
      }}
    >
      <Box
        sx={{
          maxHeight: "92dvh",
          overflowY: "auto",
          padding: { xs: 2, sm: 4 },
        }}
      >
        <div className='relative flex w-full flex-col items-center bg-white text-black'>
          <button
            aria-label='Close'
            className='absolute end-0 top-0 flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-200 hover:text-gray-900'
            onClick={handleClose}
          >
            <IoClose className='text-black' size={24} />
          </button>

          <div className='flex flex-col items-center px-8 text-center'>
            <span className='font-eightbitdragon text-lg sm:text-2xl'>
              {album.title}
            </span>
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

          <div className='h-[320px] w-full sm:h-[420px]'>
            <Canvas camera={{ position: [0, 0, 5], fov: 75 }}>
              <pointLight position={[10, 10, 10]} />
              <Vinyl3D coverArt={album.coverUrl} />
              <OrbitControls makeDefault />
            </Canvas>
          </div>

          {(onConfirm || onReject) && (
            <div className='mb-4 flex items-center gap-2 text-sm'>
              {confirmed ? (
                <span className='text-gray-600'>Thanks, noted.</span>
              ) : (
                <>
                  <span className='text-gray-600'>Right record?</span>
                  {onConfirm && (
                    <button
                      className='rounded-full border border-black px-3 py-1'
                      onClick={onConfirm}
                    >
                      Yes
                    </button>
                  )}
                  {onReject && (
                    <button
                      className='rounded-full border border-gray-300 px-3 py-1 text-gray-700'
                      onClick={onReject}
                    >
                      No, show others
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          <div className='w-full max-w-sm pb-4'>
            {!album.spotifyUrl || isError ? (
              <a
                href={album.spotifyUrl ?? spotifySearchUrl}
                target='_blank'
                rel='noreferrer'
                className='flex w-full items-center space-x-2 rounded-full bg-black p-2 px-4 text-white'
              >
                <FaSpotify className='text-lg' />
                <span>
                  {album.spotifyUrl ? "Listen on Spotify" : "Find on Spotify"}
                </span>
              </a>
            ) : !searchResult?.links ? (
              <div className='flex items-center justify-center py-6'>
                <Loader2 className='h-8 w-8 animate-spin text-black' />
              </div>
            ) : (
              <SearchCard searchResult={searchResult.links} />
            )}
          </div>
        </div>
      </Box>
    </Drawer>
  );
};

export default DigitalAlbum;
