// ** React/Next.js Imports
import React from "react";

// ** Third-Party Imports
import { motion } from "motion/react";

// ** Custom Components, Hooks, Utils, etc.
import { Adapter } from "@/config/enum";
import type { SearchResult } from "@/server/services/search";

// ** Icon Imports
import { FaDeezer, FaSoundcloud, FaSpotify } from "react-icons/fa6";
import { SiApplemusic, SiTidal, SiYoutubemusic } from "react-icons/si";

const PLATFORMS = {
  [Adapter.Spotify]: { icon: FaSpotify, label: "Spotify" },
  [Adapter.YouTube]: { icon: SiYoutubemusic, label: "YouTube Music" },
  [Adapter.Deezer]: { icon: FaDeezer, label: "Deezer" },
  [Adapter.AppleMusic]: { icon: SiApplemusic, label: "Apple Music" },
  [Adapter.Tidal]: { icon: SiTidal, label: "Tidal" },
  [Adapter.SoundCloud]: { icon: FaSoundcloud, label: "SoundCloud" },
};

const list = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};
const item = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", bounce: 0.15, duration: 0.3 },
  },
} as const;

/** "Listen on …" links for every platform the release was found on. */
const SearchCard = ({ searchResult }: { searchResult: SearchResult }) => {
  // The source link is the Spotify album we searched from; list it first.
  const rows = [
    { type: Adapter.Spotify, url: searchResult.source },
    ...searchResult.links.filter((l) => l.type !== Adapter.Spotify),
  ];

  return (
    <motion.ul
      className='space-y-2'
      variants={list}
      initial='hidden'
      animate='show'
    >
      {rows.map(({ type, url }) => {
        const { icon: Icon, label } = PLATFORMS[type];
        return (
          <motion.li key={type} variants={item}>
            <a
              href={url}
              target='_blank'
              rel='noreferrer'
              className='flex w-full items-center space-x-2 rounded-full bg-black p-2 px-4 text-white transition-transform duration-[120ms] active:scale-[0.97]'
            >
              <Icon className='text-lg' />
              <span>Listen on {label}</span>
            </a>
          </motion.li>
        );
      })}
    </motion.ul>
  );
};

export default SearchCard;
