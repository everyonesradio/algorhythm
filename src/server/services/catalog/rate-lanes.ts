import { AsyncLocalStorage } from "node:async_hooks";

const lane = new AsyncLocalStorage<"background">();

export const runInBackground = <T>(fn: () => Promise<T>) =>
  lane.run("background", fn);

export const isBackground = () => lane.getStore() === "background";

export type Lanes = {
  acquire: (priority?: "interactive" | "background") => Promise<void>;
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
