// ** React/Next.js Imports
import React from "react";

// ** Third-Party Imports
import { motion } from "motion/react";

// ** Custom Components, Hooks, Utils, etc.
import Sheet from "@/components/sheet";
import type { VinylMatch } from "@/types/api";

interface Props {
  open: boolean;
  matches: VinylMatch[];
  onPick: (index: number) => void;
  onDismiss: () => void;
  /** Fires once the close animation finishes; clear the matches here. */
  onExitComplete?: () => void;
}

const list = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04, delayChildren: 0.08 } },
};
const item = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", bounce: 0.15, duration: 0.3 },
  },
} as const;

/** "Is it one of these?" picker, shown when the match isn't certain. */
const CandidateSheet: React.FC<Props> = ({
  open,
  matches,
  onPick,
  onDismiss,
  onExitComplete,
}) => (
  <Sheet
    open={open}
    onClose={onDismiss}
    onExitComplete={onExitComplete}
    label='Possible matches'
  >
    <div className='flex flex-col gap-3'>
      <div className='flex items-center justify-between'>
        <h2 className='font-semibold'>Is it one of these?</h2>
        <button
          className='text-sm text-gray-500 transition-transform duration-[120ms] active:scale-[0.97]'
          onClick={onDismiss}
        >
          Keep scanning
        </button>
      </div>
      <motion.ul
        className='flex flex-col gap-2'
        variants={list}
        initial='hidden'
        animate='show'
      >
        {matches.map((m, i) => (
          <motion.li key={m.album.id} variants={item}>
            <button
              className='flex w-full items-center gap-3 rounded-lg p-2 text-left transition-[transform,background-color] duration-[120ms] hover:bg-gray-100 active:scale-[0.98]'
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
          </motion.li>
        ))}
      </motion.ul>
    </div>
  </Sheet>
);

export default CandidateSheet;
