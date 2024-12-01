// ** React/Next.js Imports
import React, { useEffect, useState } from "react";

// ** Third-Party Imports
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";

// ** Custom Components, Hooks, Utils, etc.
import SearchCard from "@/components/search-card";
import Vinyl3D from "@/components/vinyl-cover";
import { api } from "@/utils/trpc";

// ** Icon Imports
import { FaSpotify } from "react-icons/fa";
import { IoClose } from "react-icons/io5";

interface Props {
  isOpen: boolean;
  handleClose: () => void;
  album: any;
  vinyl: string;
}

const DigitalAlbum: React.FC<Props> = ({
  isOpen,
  handleClose,
  album,
  vinyl,
}) => {
  const { data: searchResult } = api.musicIDX.search.useQuery(
    { albumLink: album?.external_urls?.spotify },
    {
      enabled: !!album?.external_urls?.spotify,
    }
  );

  console.log("Album link: ", album?.external_urls?.spotify);
  console.log("Detected vinyl: ", vinyl);

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
            xs: 540, // mobile first - 540px for small screens
            sm: 700, // 700px for screens sm and up
          },
          padding: 4,
        }}
      >
        <div className='flex flex-col items-center justify-center h-5/6 w-full min-w-screen bg-white'>
          <button
            className='text-gray-400 bg-transparent hover:bg-gray-200 hover:text-gray-900 rounded-lg text-sm w-8 h-8 absolute top-2.5 end-2.5 flex items-center justify-center dark:hover:bg-gray-600 dark:hover:text-white'
            onClick={handleClose}
          >
            <IoClose className='text-black' size={24} />
          </button>
          {/* Display album data here */}
          <div className='flex flex-col items-center justify-center w-full h-full p-4 text-black'>
            <div className='flex flex-col items-center justify-center '>
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
            <button
              className='flex items-center space-x-2 bg-black text-white p-2 px-4 rounded-full'
              onClick={() =>
                window.open(album.external_urls?.spotify, "_blank")
              }
            >
              <FaSpotify className='text-lg' />
              <span>Add album to library</span>
            </button>
            {/* Generate links to other streaming platforms */}
            {searchResult?.links && (
              <SearchCard searchResult={searchResult.links} />
            )}
          </div>
        </div>
      </Box>
    </Drawer>
  );
};
export default DigitalAlbum;
