// ** React/Next.js Imports
import React from "react";

// ** Third-Party Imports
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";

// ** Custom Components, Hooks, Utils, etc.
import Vinyl3D from "@/components/vinyl-cover";

// ** Icon Imports
import { FaSpotify } from "react-icons/fa";
import { IoClose } from "react-icons/io5";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  albumData: any;
  vinyl: string;
}

const DigitalAlbum: React.FC<Props> = ({
  isOpen,
  onClose,
  albumData,
  vinyl,
}) => {
  const album = albumData?.albums?.items?.[0];

  console.log("Spotify results: ", albumData?.albums?.items?.[0]);
  console.log("Detected vinyl: ", vinyl);

  return (
    <div
      className={`flex flex-col items-center justify-center fixed bottom-0 left-0 z-40 h-5/6 w-full min-w-screen p-4 overflow-y-auto transition-transform 
    ${isOpen ? "translate-y-0" : "-translate-y-full"} 
    bg-white dark:bg-gray-800 rounded-t-2xl shadow-[0_-4px_12px_rgba(0,0,0,0.1)]`}
    >
      <button
        className='text-gray-400 bg-transparent hover:bg-gray-200 hover:text-gray-900 rounded-lg text-sm w-8 h-8 absolute top-2.5 end-2.5 flex items-center justify-center dark:hover:bg-gray-600 dark:hover:text-white'
        onClick={onClose}
      >
        <IoClose className='text-black' size={24} />
      </button>
      {/* Display album data here */}
      <div className='flex flex-col items-center justify-center w-full h-full p-4 text-black'>
        <div className='flex flex-col items-center justify-center '>
          <span className='font-eightbitdragon text-lg sm:text-2xl'>{album.name}</span>
          <span>
            {album.artists[0].name} - {album.release_date.split("-")[0]}
          </span>
        </div>
        <Canvas camera={{ position: [0, 0, 5], fov: 75 }}>
          <pointLight position={[10, 10, 10]} />
          <Vinyl3D coverArt={album.images[0]?.url} />
          <OrbitControls makeDefault />
        </Canvas>
        <button
          className='flex items-center space-x-2 bg-black text-white p-2 px-4 rounded-full'
          onClick={() => window.open(album.external_urls?.spotify, "_blank")}
        >
          <FaSpotify className='text-lg' />
          <span>Add album to library</span>
        </button>
      </div>
    </div>
  );
};

export default DigitalAlbum;
