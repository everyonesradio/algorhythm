// ** React/Next.js Imports
import type { AppProps } from "next/app";
import React from "react";

// ** Third-Party Imports
import { Analytics } from "@vercel/analytics/react";
import { MotionConfig } from "motion/react";

// ** Custom Components, Hooks, Utils, etc.
import Banner from "@/components/banner";
import Meta from "@/components/Meta";
import { api } from "@/utils/trpc";

// ** Styles
import "@/styles/globals.css";

function App({ Component, pageProps }: AppProps) {
  return (
    <MotionConfig reducedMotion='user'>
      <Meta />
      <Analytics />
      <div className='overflow-x-hidden'>
        <div className='fixed top-0 z-20 w-full'>
          <Banner />
        </div>
        <Component {...pageProps} />
      </div>
    </MotionConfig>
  );
}

export default api.withTRPC(App);
