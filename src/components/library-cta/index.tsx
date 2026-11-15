// ** React/Next.js Imports
import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";

// ** Third-Party Imports
import { Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

// ** Custom Components, Hooks, Utils, etc.
import { useDeviceKey } from "@/hooks/use-device-key";
import { api } from "@/utils/trpc";

// ** Icon Imports
import { IoAdd, IoCheckmark } from "react-icons/io5";

interface Props {
  albumId: string;
  scanId: string;
  ready: boolean;
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

const LibraryCta: React.FC<Props> = ({
  albumId,
  scanId,
  ready,
  onEntry,
  pageHref,
}) => {
  const deviceKey = useDeviceKey();
  const utils = api.useUtils();
  const [entryId, setEntryId] = useState<string>();
  const [count, setCount] = useState(0);
  const tried = useRef(false);

  const refresh = () =>
    Promise.all([
      utils.library.list.invalidate(),
      utils.library.stats.invalidate(),
    ]);
  const add = api.library.add.useMutation({
    onSuccess: (res) => {
      setEntryId(res.entryId);
      setCount(res.count);
      onEntry?.(res.entryId);
      void refresh();
    },
  });
  const remove = api.library.remove.useMutation({
    onSuccess: (res) => {
      setEntryId(undefined);
      setCount(res.count);
      onEntry?.(null);
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

  const error = add.error?.message ?? remove.error?.message;
  const state = entryId
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
              <span className='text-xs text-gray-500'>
                {dugLine(count)}
              </span>
            )}
          </motion.div>
        )}

        {state === "added" && entryId && (
          <motion.div
            key='added'
            className='flex items-center justify-between gap-3 rounded-2xl border-2 border-black p-2 px-4'
            {...fade}
          >
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
                  deviceKey && remove.mutate({ entryId, deviceKey })
                }
              >
                Remove
              </button>
            </span>
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
