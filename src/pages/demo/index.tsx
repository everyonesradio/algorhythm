// ** React/Next.js Imports
import React from "react";

const Demo = () => {
  const handleCamera = () => {
    // TODO: Implement camera functionality
    console.log("Camera functionality goes here");
  };

  return (
    <div className='flex min-h-screen items-center justify-center p-8'>
      <button
        onClick={handleCamera}
        className='flex h-10 shrink-0 items-center justify-center gap-2 text-white bg-black px-4 py-2 text-sm font-semibold transition-all'
      >
        <span>Scan your vinyl</span>
      </button>
    </div>
  );
};

export default Demo;
