// ** React/Next.js Imports
import React from "react";

// ** Third-Party Imports
import Drawer from "@mui/material/Drawer";

// ** Custom Components, Hooks, Utils, etc.
import type { VinylMatch } from "@/types/api";

interface Props {
  matches: VinylMatch[];
  onPick: (index: number) => void;
  onDismiss: () => void;
}

/** "Is it one of these?" picker, shown when the match isn't certain. */
const CandidateSheet: React.FC<Props> = ({ matches, onPick, onDismiss }) => (
  <Drawer
    anchor='bottom'
    open
    onClose={onDismiss}
    sx={{
      "& .MuiDrawer-paper": {
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        maxHeight: "70dvh",
      },
    }}
  >
    <div className='flex flex-col gap-3 p-5 text-black'>
      <div className='flex items-center justify-between'>
        <span className='font-semibold'>Is it one of these?</span>
        <button className='text-sm text-gray-500' onClick={onDismiss}>
          Keep scanning
        </button>
      </div>
      <ul className='flex flex-col gap-2'>
        {matches.map((m, i) => (
          <li key={m.album.id}>
            <button
              className='flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-gray-100'
              onClick={() => onPick(i)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.album.coverUrl}
                alt=''
                className='h-14 w-14 rounded object-cover'
                loading='lazy'
              />
              <span className='flex flex-col'>
                <span className='font-medium'>{m.album.title}</span>
                <span className='text-sm text-gray-600'>
                  {m.album.artist}
                  {m.album.releaseYear ? ` · ${m.album.releaseYear}` : ""}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  </Drawer>
);

export default CandidateSheet;
