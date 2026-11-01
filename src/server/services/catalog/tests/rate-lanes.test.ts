import { describe, expect, it } from "vitest";

import { createLanes, isBackground, runInBackground } from "@/server/services/catalog/rate-lanes";

/**
 * A fake clock: sleeping advances time without waiting, but only after a
 * macrotask, so callbacks for the previous grant record the right time.
 */
const fakeClock = () => {
  let t = 0;
  return {
    now: () => t,
    sleep: (ms: number) =>
      new Promise<void>((r) =>
        setImmediate(() => {
          t += ms;
          r();
        })
      ),
  };
};

describe("rate lanes", () => {
  it("serves interactive requests before queued background ones", async () => {
    const clock = fakeClock();
    const lanes = createLanes(1000, clock.now, clock.sleep);
    const order: string[] = [];
    const go = (name: string, p: "interactive" | "background") =>
      lanes.acquire(p).then(() => order.push(`${name}@${clock.now()}`));

    await Promise.all([
      go("bg1", "background"),
      go("bg2", "background"),
      go("bg3", "background"),
      go("user", "interactive"),
    ]);
    // bg1 had already been granted; the user goes next, ahead of bg2/bg3.
    expect(order).toEqual(["bg1@0", "user@1000", "bg2@2000", "bg3@3000"]);
  });

  it("keeps the gap between every request", async () => {
    const clock = fakeClock();
    const lanes = createLanes(1200, clock.now, clock.sleep);
    const times: number[] = [];
    await Promise.all([1, 2, 3].map(() => lanes.acquire("interactive").then(() => times.push(clock.now()))));
    expect(times).toEqual([0, 1200, 2400]);
  });

  it("puts work started inside runInBackground in the background lane", async () => {
    expect(isBackground()).toBe(false);
    await runInBackground(async () => {
      await Promise.resolve();
      expect(isBackground()).toBe(true);
    });
    expect(isBackground()).toBe(false);
  });
});
