// ** React/Next.js Imports
import React from "react";

// ** Icon Imports
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
  console.log("Spotify results: ", albumData);
  console.log("Detected vinyl: ", vinyl);

  return (
    <div
      className={`fixed bottom-0 left-0 z-40 h-5/6 w-full min-w-screen p-4 overflow-y-auto transition-transform ${
        isOpen ? "translate-y-0" : "-translate-y-full"
      } bg-white dark:bg-gray-800 rounded-t-2xl shadow-[0_-4px_12px_rgba(0,0,0,0.1)]`}
    >
      <button
        className='text-gray-400 bg-transparent hover:bg-gray-200 hover:text-gray-900 rounded-lg text-sm w-8 h-8 absolute top-2.5 end-2.5 flex items-center justify-center dark:hover:bg-gray-600 dark:hover:text-white'
        onClick={onClose}
      >
        <IoClose className='text-black' size={24} />
      </button>
      {/* Add album data display here */}
    </div>
  );
};

export default DigitalAlbum;
