// ** React/Next.js Imports
import React, { useEffect } from "react";

// ** Third-Party Imports
import { Loader2 } from "lucide-react";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";

// ** Custom Components, Hooks, Utils, etc.
import SearchCard from "@/components/search-card";
import Vinyl3D from "@/components/vinyl-cover";
import { api } from "@/utils/trpc";

// ** Icon Imports
import { IoClose } from "react-icons/io5";

interface Props {
  isOpen: boolean;
  handleClose: () => void;
  album: any;
}

const DigitalAlbum: React.FC<Props> = ({ isOpen, handleClose, album }) => {
  const { mutateAsync: musicIDXEntry } = api.musicIDX.add.useMutation();
  const { data: searchResult } = api.musicIDX.search.useQuery(
    { albumLink: album?.external_urls?.spotify },
    {
      enabled: !!album?.external_urls?.spotify,
    }
  );

  const processSpotifyAlbum = async (album: any) => {
    const artist = album.artists?.[0];
    const spotifyArtistUrlRegex = /^https:\/\/open\.spotify\.com\/artist\/.+$/;
    const spotifyAlbumUrlRegex = /^https:\/\/open\.spotify\.com\/album\/.+$/;

    const artistLink = artist.external_urls?.spotify;
    const albumLink = album.external_urls?.spotify;

    await musicIDXEntry({
      artistName: artist.name,
      artistLink: spotifyArtistUrlRegex.test(artistLink)
        ? artistLink
        : undefined,
      albumLink: spotifyAlbumUrlRegex.test(albumLink) ? albumLink : undefined,
      spotifyId: artist.id,
    });
  };

  useEffect(() => {
    if (album?.external_urls?.spotify) {
      processSpotifyAlbum(album);
      console.log("Album link: ", album?.external_urls?.spotify);
    }
  }, [album?.external_urls?.spotify]);

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
          height: {
            xs: 640, // mobile first - 640px for small screens
            sm: 700, // 700px for screens sm and up
          },
          padding: 4,
        }}
      >
        <div className='flex flex-col items-center justify-center w-full h-full min-w-screen bg-white'>
          <button
            className='text-gray-400 bg-transparent hover:bg-gray-200 hover:text-gray-900 rounded-lg text-sm w-8 h-8 absolute top-2.5 end-2.5 flex items-center justify-center dark:hover:bg-gray-600 dark:hover:text-white'
            onClick={handleClose}
          >
            <IoClose className='text-black' size={24} />
          </button>
          {!searchResult?.links ? (
            <div className='flex items-center justify-center my-32'>
              <Loader2 className='h-16 w-16 animate-spin text-black' />
            </div>
          ) : (
            <div className='flex flex-col items-center justify-center w-full h-full p-4 text-black'>
              <div className='flex flex-col items-center justify-center'>
                <span className='font-eightbitdragon text-lg sm:text-2xl'>
                  {album.name}
                </span>
                <span className='font-medium'>
                  {album.artists[0].name} - {album.release_date.split("-")[0]}
                </span>
              </div>
              <div className='w-full h-2/3 sm:h-5/6'>
                <Canvas camera={{ position: [0, 0, 5], fov: 75 }}>
                  <pointLight position={[10, 10, 10]} />
                  <Vinyl3D coverArt={album.images[0]?.url} />
                  <OrbitControls makeDefault />
                </Canvas>
              </div>
              {/* Generate links to streaming platforms */}
              <SearchCard searchResult={searchResult.links} />
            </div>
          )}
        </div>
      </Box>
    </Drawer>
  );
};

export default DigitalAlbum;
