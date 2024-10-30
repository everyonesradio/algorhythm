// ** React/Next.js Imports
import React from "react";

// ** Third-Party Imports
import Marquee from "react-fast-marquee";

// ** Icon Imports
import { PiStarFourFill } from "react-icons/pi";

const Banner = () => {
  return (
    <Marquee className='bg-black py-2' speed={75} autoFill={true}>
      <div className='flex items-center gap-4 pr-4'>
        <span className='text-md text-white font-eightbitdragon'>
          Sign up for the waitlist to access our product demo!
        </span>
        <PiStarFourFill className='inline-block text-white' />
      </div>
    </Marquee>
  );
};

export default Banner;
