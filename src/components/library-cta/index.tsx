// ** React/Next.js Imports
import Link from "next/link";
import React, { useId, useState } from "react";

// ** Third-Party Imports
import { Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

// ** Custom Components, Hooks, Utils, etc.
import { useDeviceKey } from "@/hooks/use-device-key";
import { useJoinedEvent } from "@/hooks/use-joined-event";
import { api } from "@/utils/trpc";

// ** Icon Imports
import { IoAdd, IoCheckmark } from "react-icons/io5";

const NOTE_MAX = 140;

interface Props {
  albumId: string;
  /** The scan that identified this record: only real scans can be added. */
  scanId: string;
  /** The cover the scan matched (a pressing or the Spotify art), if any. */
  coverUrl?: string;
  /** Adding a find also confirms the record. */
  onAdded?: () => void;
  /** The album's library page ("See it"); defaults to the library. */
  pageHref?: string;
}

const fade = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.16 },
} as const;

const dugLine = (count: number, mine: boolean) =>
  mine && count <= 1
    ? "first find"
    : count === 1
      ? "Dug once so far"
      : mine
        ? `dug ${count} times`
        : `Dug ${count} times`;

/**
 * "Add to library": put the record you just scanned into the public library
 * of finds (docs/PUBLIC_LIBRARY.md). Open and anonymous: an optional note,
 * no account. Shown next to the streaming links.
 */
const LibraryCta: React.FC<Props> = ({
  albumId,
  scanId,
  coverUrl,
  onAdded,
  pageHref,
}) => {
  const deviceKey = useDeviceKey();
  const joined = useJoinedEvent();
  const noteId = useId();
  const utils = api.useUtils();
  const [writing, setWriting] = useState(false);
  const [note, setNote] = useState("");

  const status = api.library.status.useQuery(
    { albumId, scanId, deviceKey },
    { enabled: !!deviceKey, staleTime: 30_000 }
  );
  // The button, the album's finds and the library itself all change.
  const refresh = () =>
    Promise.all([
      utils.library.status.invalidate({ albumId }),
      utils.library.finds.invalidate({ albumId }),
      utils.library.list.invalidate(),
      utils.library.stats.invalidate(),
    ]);
  const add = api.library.add.useMutation({
    onSuccess: () => {
      setWriting(false);
      onAdded?.();
      void refresh();
    },
  });
  const remove = api.library.remove.useMutation({
    onSuccess: () => void refresh(),
  });

  const count = status.data?.count ?? 0;
  const entryId = status.data?.entryId ?? null;
  const state = entryId ? "added" : writing ? "writing" : "idle";
  const error = add.error?.message ?? remove.error?.message ?? null;
  // After adding at a pop-up: say it counted, or why it didn't.
  const eventLine =
    state === "added" && add.data
      ? add.data.event && joined
        ? `Counted for ${joined.name}`
        : add.data.eventProblem
          ? `Added, but not counted for the pop-up: ${add.data.eventProblem}`
          : null
      : null;

  return (
    <div className='flex w-full flex-col gap-2'>
      <AnimatePresence mode='wait' initial={false}>
        {state === "idle" && (
          <motion.div
            key='idle'
            className='flex flex-col items-center gap-1.5'
            {...fade}
          >
            <button
              className='flex w-full items-center justify-center gap-2 rounded-full border-2 border-black p-2 px-4 font-medium transition-transform duration-[120ms] active:scale-[0.97] disabled:opacity-50'
              disabled={!deviceKey}
              onClick={() => setWriting(true)}
            >
              <IoAdd className='text-lg' />
              Add to library
            </button>
            {count > 0 && (
              <span className='text-xs text-gray-500'>
                {dugLine(count, false)}
              </span>
            )}
          </motion.div>
        )}

        {state === "writing" && (
          <motion.form
            key='writing'
            className='flex flex-col gap-2 rounded-2xl bg-gray-100 p-3'
            {...fade}
            onSubmit={(e) => {
              e.preventDefault();
              if (!deviceKey || add.isPending) return;
              add.mutate({
                albumId,
                scanId,
                deviceKey,
                note: note.trim() || null,
                coverUrl,
                // At a pop-up: credit the find to it.
                event: joined ? { slug: joined.slug, code: joined.code } : null,
              });
            }}
          >
            <label htmlFor={noteId} className='text-sm font-medium'>
              Add a note{" "}
              <span className='font-normal text-gray-500'>(optional)</span>
            </label>
            <textarea
              id={noteId}
              rows={2}
              maxLength={NOTE_MAX}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder='Where you found it, why it caught your eye…'
              className='w-full resize-none rounded-xl border border-gray-300 bg-white p-2 text-sm outline-none focus:border-black'
            />
            <div className='flex items-center justify-between gap-2'>
              <span className='text-xs tabular-nums text-gray-500'>
                {note.length}/{NOTE_MAX} · Shown publicly, no name attached
              </span>
              <div className='flex gap-2'>
                <button
                  type='button'
                  className='rounded-full px-3 py-1.5 text-sm text-gray-600'
                  onClick={() => setWriting(false)}
                >
                  Cancel
                </button>
                <button
                  type='submit'
                  disabled={add.isPending}
                  className='flex items-center gap-1.5 rounded-full bg-black px-4 py-1.5 text-sm font-medium text-white transition-transform duration-[120ms] active:scale-[0.97] disabled:opacity-60'
                >
                  {add.isPending && (
                    <Loader2 className='h-4 w-4 animate-spin' />
                  )}
                  Add
                </button>
              </div>
            </div>
          </motion.form>
        )}

        {state === "added" && (
          <motion.div
            key='added'
            className='flex items-center justify-between gap-3 rounded-2xl border-2 border-black p-2 px-4'
            {...fade}
          >
            <span className='flex items-center gap-2 text-sm font-medium'>
              <IoCheckmark className='text-lg' />
              In the library · {dugLine(count, true)}
            </span>
            <span className='flex shrink-0 items-center gap-3'>
              <Link
                href={pageHref ?? "/library"}
                className='text-sm text-gray-600 underline-offset-2 hover:underline'
              >
                See it
              </Link>
              <button
                className='text-sm text-gray-600 underline-offset-2 hover:underline disabled:opacity-50'
                disabled={remove.isPending}
                onClick={() =>
                  entryId && deviceKey && remove.mutate({ entryId, deviceKey })
                }
              >
                Undo
              </button>
            </span>
          </motion.div>
        )}
      </AnimatePresence>
      {state === "writing" && joined && (
        <p className='text-center text-xs text-gray-500'>
          Counts for {joined.name}
        </p>
      )}
      {eventLine && (
        <p className='text-center text-xs text-gray-600'>{eventLine}</p>
      )}
      {error && (
        <p role='alert' className='text-center text-xs text-red-600'>
          {error}
        </p>
      )}
    </div>
  );
};

export default LibraryCta;
