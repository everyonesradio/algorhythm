// ** React/Next.js Imports
import Image from "next/image";
import React from "react";

// ** Third-Party Imports
import { TypeAnimation } from "react-type-animation";

// ** Custom Components, Hooks, Utils, etc.
import Waitlist from "@/components/waitlist";

const Home = () => {
  return (
    <main className='flex min-h-screen flex-col items-center justify-center p-8'>
      <div className='flex flex-col w-full max-w-5xl items-center justify-center font-sans lg:flex'>
        <Image
          src={"/images/vinyl.png"}
          alt={"vinyl animation"}
          className='pb-2 animate-spin'
          width={220}
          height={220}
        />
        <TypeAnimation
          sequence={["algoRhythm"]}
          speed={{ type: "keyStrokeDelayInMs", value: 100 }}
          wrapper='span'
          cursor={false}
          style={{
            fontSize: "2em",
            display: "inline-block",
            fontFamily: "eightbitdragon",
          }}
        />
        <span className='text-md font-semibold'>AI for music vinyls</span>
      </div>
      <Waitlist />
    </main>
  );
};

export default Home;
