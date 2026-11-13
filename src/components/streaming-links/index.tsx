// ** React/Next.js Imports
import React from "react";

// ** Third-Party Imports
import { Loader2 } from "lucide-react";

// ** Custom Components, Hooks, Utils, etc.
import SearchCard from "@/components/search-card";
import type { VinylAlbum } from "@/types/api";
import { api } from "@/utils/trpc";

// ** Icon Imports
import { FaSpotify } from "react-icons/fa6";

/**
 * "Listen on …" links for an album, cached on the album server-side. Falls
 * back to a Spotify search when no exact link was found.
 */
const StreamingLinks: React.FC<{
  album: Pick<VinylAlbum, "id" | "title" | "artist" | "spotifyUrl">;
}> = ({ album }) => {
  const { data, isError } = api.vinyl.links.useQuery(
    { albumId: album.id },
    { retry: 1, staleTime: Infinity }
  );
  const links = data?.links.length ? data.links : null;
  const showSpotifyFallback = isError || (data !== undefined && !links);
  const spotifySearchUrl = `https://open.spotify.com/search/${encodeURIComponent(
    `${album.artist} ${album.title}`
  )}`;

  if (showSpotifyFallback) {
    return (
      <a
        href={album.spotifyUrl ?? spotifySearchUrl}
        target='_blank'
        rel='noreferrer'
        className='flex w-full items-center space-x-2 rounded-full bg-black p-2 px-4 text-white transition-transform duration-[120ms] active:scale-[0.97]'
      >
        <FaSpotify className='text-lg' />
        <span>
          {album.spotifyUrl ? "Listen on Spotify" : "Find on Spotify"}
        </span>
      </a>
    );
  }
  if (!links) {
    return (
      <div className='flex items-center justify-center py-6'>
        <Loader2 className='h-8 w-8 animate-spin text-black' />
      </div>
    );
  }
  return <SearchCard links={links} />;
};

export default StreamingLinks;
