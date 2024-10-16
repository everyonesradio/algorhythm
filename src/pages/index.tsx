// ** React/Next.js Imports
import Image from "next/image";
import React from "react";

// ** Custom Components, Hooks, Utils, etc.
import Waitlist from "@/components/waitlist";

const Home = () => {
  return (
    <main className='flex min-h-screen flex-col items-center justify-center p-8'>
      <div className='flex flex-col w-full max-w-5xl items-center justify-center font-sans lg:flex'>
        <Image
          src={"/images/algo-logo.png"}
          alt={"License Background"}
          width={220}
          height={220}
        />
        <span className='text-sm underline'>AI for music vinyls</span>
      </div>
      <Waitlist />
    </main>
  );
};

export default Home;
