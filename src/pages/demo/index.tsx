// ** React/Next.js Imports
import Image from "next/image";
import React from "react";

// ** Third-Party Imports
import { TypeAnimation } from "react-type-animation";

const Demo = () => {
  return (
    <main className='flex min-h-screen flex-col items-center justify-center p-8'>
      <div className='flex flex-col w-full max-w-5xl items-center justify-center font-sans'>
        <Image
          src={"/images/vinyl.png"}
          alt={"vinyl animation"}
          className='pb-2 animate-spin'
          width={220}
          height={220}
        />
        <TypeAnimation
          sequence={["algoRhythm"]}
          speed={{ type: "keyStrokeDelayInMs", value: 120 }}
          wrapper='span'
          cursor={false}
          style={{
            fontSize: "2em",
            display: "inline-block",
            fontFamily: "eightbitdragon",
          }}
        />
        <span className='text-md font-semibold'>vinyl recognition app</span>
        <div className='w-64 h-px bg-gray-600 my-4'></div>
        <div className='flex flex-col items-center justify-center pt-4'>
          <span className='text-lg font-eightbitdragon font-semibold'>
            A2B Vinyl Listening Session
          </span>
          <span className='text-md font-semibold'>THURSDAY NOV. 14</span>
          <span className='text-md font-semibold'>8PM -10PM</span>
          <span className='text-md font-semibold'>1201 K Street NW</span>
        </div>
      </div>
    </main>
  );
};

export default Demo;
