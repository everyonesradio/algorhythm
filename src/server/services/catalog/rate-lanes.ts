import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Rate-limited request scheduling w/ two lanes.
 *
 * External APIs (MusicBrainz: ~1 req/s) are shared by people waiting on a
 * screen (artist search, discography, pick) and by background catalog
 * ingest started by scans. Measured before this existed: during a Radiohead
 * catalog ingest, the picker's search + discography went from 2.4s to 6.0s
 * because both queued behind the same throttle.
 *
 * Every request takes a slot from one scheduler; interactive requests always
 * get the next slot, background requests only when no one is waiting.
 * Background work is marked with `runInBackground` (AsyncLocalStorage), so
 * call sites don't change.
 */

const lane = new AsyncLocalStorage<"background">();

/** Run `fn` (and everything it awaits) in the background lane. */
export const runInBackground = <T>(fn: () => Promise<T>) =>
  lane.run("background", fn);

export const isBackground = () => lane.getStore() === "background";

export type Lanes = {
  /** Wait for this request's turn; resolves when it may fire. */
  acquire: (priority?: "interactive" | "background") => Promise<void>;
  /** Current gap between requests (adapts to rate-limit replies). */
  gap: () => number;
  setGap: (ms: number) => void;
};

export const createLanes = (
  initialGapMs: number,
  now: () => number = Date.now,
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((r) => setTimeout(r, ms))
): Lanes => {
  const waiting = {
    interactive: [] as (() => void)[],
    background: [] as (() => void)[],
  };
  let gapMs = initialGapMs;
  let last = -Infinity;
  let pumping = false;

  const pump = async () => {
    if (pumping) return;
    pumping = true;
    try {
      while (waiting.interactive.length || waiting.background.length) {
        const wait = last + gapMs - now();
        if (wait > 0) await sleep(wait);
        // Decide *after* waiting, so a request that arrived meanwhile wins.
        const next = waiting.interactive.shift() ?? waiting.background.shift();
        last = now();
        next?.();
      }
    } finally {
      pumping = false;
    }
  };

  return {
    acquire: (priority) =>
      new Promise<void>((resolve) => {
        const p = priority ?? (isBackground() ? "background" : "interactive");
        waiting[p].push(resolve);
        void pump();
      }),
    gap: () => gapMs,
    setGap: (ms) => {
      gapMs = ms;
    },
  };
};
