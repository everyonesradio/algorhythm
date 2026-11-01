// ** React/Next.js Imports
import Image from "next/image";
import React from "react";

// ** Third-Party Imports
import { motion } from "motion/react";
import { TypeAnimation } from "react-type-animation";

// ** Custom Components, Hooks, Utils, etc.
import Waitlist from "@/components/waitlist";

const homeEnter = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { type: "spring" as const, bounce: 0.12, duration: 0.35 },
};

const Home = () => {
  return (
    <main className='flex min-h-screen flex-col items-center justify-center p-8'>
      <motion.div
        className='flex flex-col w-full max-w-5xl items-center justify-center font-sans'
        initial={homeEnter.initial}
        animate={homeEnter.animate}
        transition={homeEnter.transition}
      >
        <Image
          src={"/images/vinyl.png"}
          alt={"vinyl animation"}
          className='pb-2 animate-spin'
          width={220}
          height={220}
          priority={true}
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
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          type: "spring",
          bounce: 0.1,
          duration: 0.35,
          delay: 0.08,
        }}
        className='w-full'
      >
        <Waitlist />
      </motion.div>
    </main>
  );
};

export default Home;
