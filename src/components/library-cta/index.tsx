// ** React/Next.js Imports
import Link from "next/link";
import React, { useEffect, useId, useRef, useState } from "react";

// ** Third-Party Imports
import { Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

// ** Custom Components, Hooks, Utils, etc.
import { useDeviceKey } from "@/hooks/use-device-key";
import { api } from "@/utils/trpc";

// ** Icon Imports
import { IoAdd, IoCheckmark } from "react-icons/io5";

const NOTE_MAX = 140;

interface Props {
  albumId: string;
  scanId: string;
  /** The scan has identified this record, so it can go in. */
  ready: boolean;
  /** The find this phone holds for the record, or null once removed. */
  onEntry?: (entryId: string | null) => void;
  pageHref?: string;
}

const fade = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.16 },
} as const;

const dugLine = (count: number) =>
  count <= 1 ? "First find" : `Dug ${count} times`;

/**
 * Every scanned record goes into the public library on its own. This row
 * says so, and lets the person take it back out or leave a note.
 */
const LibraryCta: React.FC<Props> = ({
  albumId,
  scanId,
  ready,
  onEntry,
  pageHref,
}) => {
  const deviceKey = useDeviceKey();
  const noteId = useId();
  const utils = api.useUtils();
  const [entry, setEntry] = useState<{ id: string; note: string | null }>();
  const [count, setCount] = useState(0);
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState("");
  const tried = useRef(false);

  const refresh = () =>
    Promise.all([
      utils.library.finds.invalidate({ albumId }),
      utils.library.list.invalidate(),
      utils.library.stats.invalidate(),
    ]);
  const add = api.library.add.useMutation({
    onSuccess: (res) => {
      setEntry({ id: res.entryId, note: res.note });
      setCount(res.count);
      onEntry?.(res.entryId);
      void refresh();
    },
  });
  const remove = api.library.remove.useMutation({
    onSuccess: (res) => {
      setEntry(undefined);
      setWriting(false);
      setCount(res.count);
      onEntry?.(null);
      void refresh();
    },
  });
  const note = api.library.note.useMutation({
    onSuccess: (res) => {
      setEntry((e) => e && { ...e, note: res.note });
      setWriting(false);
      void refresh();
    },
  });

  const addNow = () => {
    if (deviceKey) add.mutate({ albumId, scanId, deviceKey });
  };
  useEffect(() => {
    if (!ready || !deviceKey || tried.current) return;
    tried.current = true;
    add.mutate({ albumId, scanId, deviceKey });
    // add.mutate is stable; this runs once per record and scan
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, deviceKey, albumId, scanId]);

  if (!ready) return null;

  const error =
    add.error?.message ?? remove.error?.message ?? note.error?.message;
  const state = entry
    ? "added"
    : add.isError || remove.isSuccess
      ? "out"
      : "adding";

  return (
    <div className='flex w-full flex-col gap-2'>
      <AnimatePresence mode='wait' initial={false}>
        {state === "adding" && (
          <motion.div
            key='adding'
            className='flex items-center justify-center gap-2 rounded-2xl border-2 border-black/20 p-2 px-4 text-sm text-gray-600'
            {...fade}
          >
            <Loader2 className='h-4 w-4 animate-spin' />
            Adding to the library
          </motion.div>
        )}

        {state === "out" && (
          <motion.div
            key='out'
            className='flex flex-col items-center gap-1.5'
            {...fade}
          >
            <button
              className='flex w-full items-center justify-center gap-2 rounded-full border-2 border-black p-2 px-4 font-medium transition-transform duration-[120ms] active:scale-[0.97] disabled:opacity-50'
              disabled={!deviceKey || add.isPending}
              onClick={addNow}
            >
              {add.isPending ? (
                <Loader2 className='h-4 w-4 animate-spin' />
              ) : (
                <IoAdd className='text-lg' />
              )}
              Add to library
            </button>
            {count > 0 && (
              <span className='text-xs text-gray-500'>{dugLine(count)}</span>
            )}
          </motion.div>
        )}

        {state === "added" && entry && (
          <motion.div
            key='added'
            className='flex flex-col gap-2 rounded-2xl border-2 border-black p-2 px-4'
            {...fade}
          >
            <div className='flex items-center justify-between gap-3'>
              <span className='flex items-center gap-2 text-sm font-medium'>
                <IoCheckmark className='text-lg' />
                In the library · {dugLine(count)}
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
                    deviceKey && remove.mutate({ entryId: entry.id, deviceKey })
                  }
                >
                  Remove
                </button>
              </span>
            </div>

            {writing ? (
              <form
                className='flex flex-col gap-2 pb-1'
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!deviceKey || note.isPending) return;
                  note.mutate({
                    entryId: entry.id,
                    deviceKey,
                    note: draft.trim() || null,
                  });
                }}
              >
                <label htmlFor={noteId} className='sr-only'>
                  Note
                </label>
                <textarea
                  id={noteId}
                  rows={2}
                  maxLength={NOTE_MAX}
                  value={draft}
                  autoFocus
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder='Where you found it, why it caught your eye…'
                  className='w-full resize-none rounded-xl border border-gray-300 bg-white p-2 text-sm outline-none focus:border-black'
                />
                <div className='flex items-center justify-between gap-2'>
                  <span className='text-xs tabular-nums text-gray-500'>
                    {draft.length}/{NOTE_MAX} · Public, no name attached
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
                      disabled={note.isPending}
                      className='flex items-center gap-1.5 rounded-full bg-black px-4 py-1.5 text-sm font-medium text-white transition-transform duration-[120ms] active:scale-[0.97] disabled:opacity-60'
                    >
                      {note.isPending && (
                        <Loader2 className='h-4 w-4 animate-spin' />
                      )}
                      Save
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <button
                className='self-start pb-1 text-left text-sm text-gray-600 underline-offset-2 hover:underline'
                onClick={() => {
                  setDraft(entry.note ?? "");
                  setWriting(true);
                }}
              >
                {entry.note ? `“${entry.note}” · Edit` : "Add a note"}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      {error && (
        <p role='alert' className='text-center text-xs text-red-600'>
          {error}
        </p>
      )}
    </div>
  );
};

export default LibraryCta;
