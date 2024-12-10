// ** React/Next.js Imports
import React from "react";

// ** Custom Components, Hooks, Utils, etc.
import { Adapter } from "@/config/enum";
import { SearchResult } from "@/server/services/search";

// ** Icon Imports
import { FaDeezer, FaSoundcloud, FaSpotify } from "react-icons/fa6";
import { SiApplemusic, SiTidal, SiYoutubemusic } from "react-icons/si";

const SEARCH_LINK_DICT = {
  [Adapter.Spotify]: {
    icon: FaSpotify,
    label: "Spotify",
  },
  [Adapter.YouTube]: {
    icon: SiYoutubemusic,
    label: "YouTube Music",
  },
  [Adapter.Deezer]: {
    icon: FaDeezer,
    label: "Deezer",
  },
  [Adapter.AppleMusic]: {
    icon: SiApplemusic,
    label: "Apple Music",
  },
  [Adapter.Tidal]: {
    icon: SiTidal,
    label: "Tidal",
  },
  [Adapter.SoundCloud]: {
    icon: FaSoundcloud,
    label: "SoundCloud",
  },
};

const SearchCard = (props: { searchResult: SearchResult }) => {
  const { links, source } = props.searchResult;

  return (
    <div className='space-y-2'>
      {/* Spotify button using source link */}
      <button
        className='flex items-center w-full space-x-2 bg-black text-white p-2 px-4 rounded-full'
        onClick={() => window.open(source, "_blank")}
      >
        <FaSpotify className='text-lg' />
        <span>Listen on Spotify</span>
      </button>

      {/* Other platform buttons */}
      {links
        .filter((link) => link.type !== Adapter.Spotify) // Filter out Spotify from links
        .map(({ type, url }) => {
          const platformInfo = SEARCH_LINK_DICT[type];
          const Icon = platformInfo?.icon;

          return (
            <button
              key={type}
              className='flex items-center w-full space-x-2 bg-black text-white p-2 px-4 rounded-full'
              onClick={() => window.open(url, "_blank")}
            >
              <Icon className='text-lg' />
              <span>Listen on {platformInfo?.label}</span>
            </button>
          );
        })}
    </div>
  );
};

export default SearchCard;
