import React from "react";

import { Adapter } from "@/config/enum";
import { SearchResult } from "@/server/services/search";

const SEARCH_LINK_DICT = {
  [Adapter.Spotify]: {
    icon: "fab fa-spotify",
    label: "Spotify",
  },
  [Adapter.YouTube]: {
    icon: "fab fa-youtube",
    label: "YouTube Music",
  },
  [Adapter.Deezer]: {
    icon: "fab fa-deezer",
    label: "Deezer",
  },
  [Adapter.AppleMusic]: {
    icon: "fab fa-apple",
    label: "Apple Music",
  },
  [Adapter.Tidal]: {
    icon: "fa fa-music",
    label: "Tidal",
  },
  [Adapter.SoundCloud]: {
    icon: "fab fa-soundcloud",
    label: "SoundCloud",
  },
};

const SearchCard = (props: { searchResult: SearchResult }) => {
  return (
    <div className='space-y-2 border-2'>
      {props.searchResult.links.map(({ type, url }) => {
        const platformInfo = SEARCH_LINK_DICT[type];
        return (
          <button
            key={type}
            className='flex items-center w-full space-x-2 bg-black text-white p-2 px-4 rounded-full'
            onClick={() => window.open(url, "_blank")}
          >
            <i className={`${platformInfo.icon} text-lg`} />
            <span>Listen on {platformInfo.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default SearchCard;
