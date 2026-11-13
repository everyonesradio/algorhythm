// ** React/Next.js Imports
import Image from "next/image";
import Link from "next/link";
import React from "react";

// ** Third-Party Imports
import { Camera, Headphones, ScanSearch } from "lucide-react";
import { motion } from "motion/react";
import { TypeAnimation } from "react-type-animation";

// ** Custom Components, Hooks, Utils, etc.
import LibraryStrip from "@/components/library-strip";
import Waitlist from "@/components/waitlist";

// ** Icon Imports
import { FaDeezer, FaSoundcloud, FaSpotify } from "react-icons/fa6";
import { SiApplemusic, SiTidal, SiYoutubemusic } from "react-icons/si";

const spring = { type: "spring", bounce: 0.12, duration: 0.45 } as const;

const STEPS = [
  {
    icon: Camera,
    title: "Point",
    body: "Hold any record sleeve up to your phone's camera.",
  },
  {
    icon: ScanSearch,
    title: "Match",
    body: "We recognise the cover in a second or two. Your photo never leaves your phone.",
  },
  {
    icon: Headphones,
    title: "Listen",
    body: "Open the album on the streaming app you already use.",
  },
];

const PLATFORMS = [
  { icon: FaSpotify, label: "Spotify" },
  { icon: SiApplemusic, label: "Apple Music" },
  { icon: SiTidal, label: "Tidal" },
  { icon: SiYoutubemusic, label: "YouTube Music" },
  { icon: FaSoundcloud, label: "SoundCloud" },
  { icon: FaDeezer, label: "Deezer" },
];

/**
 * A record sliding half out of its sleeve, then spinning at 33⅓ rpm
 * (one turn every 1.8s). The slide plays once; the spin stops for people
 * who prefer reduced motion.
 */
const RecordInSleeve = () => (
  <div
    className='relative h-[200px] w-[300px] sm:h-[260px] sm:w-[390px]'
    role='img'
    aria-label='algoRhythm record spinning out of its sleeve'
  >
    <motion.div
      className='absolute right-0 top-[5px] h-[190px] w-[190px] sm:top-[6px] sm:h-[248px] sm:w-[248px]'
      initial={{ x: "-45%" }}
      animate={{ x: 0 }}
      transition={{ ...spring, duration: 0.9, delay: 0.25 }}
    >
      <Image
        src='/images/vinyl.png'
        alt=''
        fill
        priority
        sizes='(min-width: 640px) 248px, 190px'
        className='animate-[spin_1.8s_linear_infinite] drop-shadow-xl motion-reduce:animate-none'
      />
    </motion.div>
    {/* Sleeve sits on top so the record appears to slide out of it. */}
    <div className='absolute left-0 top-0 flex h-[200px] w-[200px] flex-col justify-end rounded-md bg-black p-4 shadow-2xl sm:h-[260px] sm:w-[260px] sm:p-5'>
      <div className='absolute inset-3 rounded-sm border border-white/10' />
      {/* Ring wear: the faint circle a record leaves on a well-played sleeve. */}
      <div className='absolute left-1/2 top-1/2 h-[78%] w-[78%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.07]' />
      <TypeAnimation
        sequence={[400, "algoRhythm"]}
        speed={{ type: "keyStrokeDelayInMs", value: 120 }}
        wrapper='span'
        cursor={false}
        className='relative min-h-[1.75rem] font-eightbitdragon text-lg text-white sm:min-h-8 sm:text-2xl'
      />
      <span className='relative text-[10px] uppercase tracking-[0.2em] text-white/50 sm:text-xs'>
        Side A · 33⅓ rpm
      </span>
    </div>
  </div>
);

const Home = () => (
  <main className='min-h-dvh bg-[#f4f0e8] text-[#111] [background-image:radial-gradient(circle_at_70%_20%,rgba(255,255,255,0.9),transparent_55%)]'>
    {/* Top bar: the library is open to anyone, before they try the app. */}
    <nav className='mx-auto flex max-w-5xl justify-end px-4 pt-14 sm:px-8'>
      <Link
        href='/library'
        className='rounded-full border border-black/15 bg-white/60 px-4 py-1.5 text-sm font-medium transition-colors hover:border-black/40'
      >
        The Library
      </Link>
    </nav>

    {/* Hero: record + pitch + signup. Stacks on mobile, side by side on desktop. */}
    <section className='mx-auto flex max-w-5xl flex-col items-center gap-10 px-4 pb-12 pt-8 sm:px-8 md:flex-row-reverse md:items-center md:justify-between md:gap-12 md:pt-16'>
      <RecordInSleeve />

      <motion.div
        className='flex w-full max-w-md flex-col items-center gap-5 text-center md:items-start md:text-left'
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring}
      >
        <h1 className='text-[2.1rem] font-bold leading-[1.1] tracking-tight sm:text-5xl'>
          Your records, on every app.
        </h1>
        <p className='text-base text-black/70 sm:text-lg'>
          Point your phone at a vinyl sleeve and algoRhythm finds the album on
          Spotify, Apple Music, YouTube Music and more.
        </p>
        <Waitlist />
      </motion.div>
    </section>

    {/* How it works */}
    <section className='mx-auto max-w-5xl px-4 pb-16 sm:px-8'>
      <motion.ol
        className='grid gap-3 sm:grid-cols-3 sm:gap-4'
        initial='hidden'
        whileInView='show'
        viewport={{ once: true, margin: "-60px" }}
        variants={{ show: { transition: { staggerChildren: 0.06 } } }}
      >
        {STEPS.map(({ icon: Icon, title, body }, i) => (
          <motion.li
            key={title}
            variants={{
              hidden: { opacity: 0, y: 10 },
              show: { opacity: 1, y: 0, transition: spring },
            }}
            className='flex gap-4 rounded-2xl bg-white/70 p-5 ring-1 ring-black/5 sm:flex-col sm:gap-3'
          >
            <div className='flex shrink-0 items-center gap-3'>
              <span className='font-eightbitdragon text-2xl text-black/30'>
                {i + 1}
              </span>
              <span className='flex h-10 w-10 items-center justify-center rounded-full bg-black text-white'>
                <Icon className='h-5 w-5' />
              </span>
            </div>
            <div>
              <h2 className='font-semibold'>{title}</h2>
              <p className='text-sm text-black/65'>{body}</p>
            </div>
          </motion.li>
        ))}
      </motion.ol>

      <div className='mt-10 flex flex-col items-center gap-3'>
        <p className='text-xs uppercase tracking-[0.2em] text-black/50'>
          Works with
        </p>
        <ul className='flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-black/70'>
          {PLATFORMS.map(({ icon: Icon, label }) => (
            <li key={label} className='flex items-center gap-2 text-sm'>
              <Icon className='h-5 w-5' aria-hidden />
              {label}
            </li>
          ))}
        </ul>
      </div>
    </section>

    <LibraryStrip />

    <footer className='pb-10 text-center text-xs text-black/45'>
      Built for everyone
    </footer>
  </main>
);

export default Home;
