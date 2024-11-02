// ** React/Next.js Imports
import { useRouter } from "next/router";
import React from "react";

// ** Third-Party Imports
import Marquee from "react-fast-marquee";

// ** Icon Imports
import { PiStarFourFill } from "react-icons/pi";

const Banner = () => {
  const router = useRouter();
  const currentRoute = router.pathname;

  const getBannerMessage = (route: string) => {
    if (route === "/scan-vinyl") {
      return "Scan your vinyl!";
    }
    return "Sign up for the waitlist to access our product demo!";
  };

  const bannerMessage = getBannerMessage(currentRoute);

  return (
    <Marquee className='bg-black py-2' speed={75} autoFill={true}>
      <div className='flex items-center gap-4 pr-4'>
        <span className='text-md text-white font-eightbitdragon'>
          {bannerMessage}
        </span>
        <PiStarFourFill className='inline-block text-white' />
      </div>
    </Marquee>
  );
};

export default Banner;
