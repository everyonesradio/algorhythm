import { describe, expect, it, vi } from "vitest";

import {
  dropOldScanVectors,
  maybeSweepScanLog,
  SCAN_ACTION_WINDOW_MS,
  SCAN_VECTOR_RETENTION_MS,
  scanIsActionable,
} from "@/server/services/vinyl/scan-log";

const NOW = Date.parse("2026-11-02T12:00:00Z");

describe("scan log retention", () => {
  it("drops vectors of scans older than a day, and only those", async () => {
    const updateMany = vi.fn(async () => ({ count: 3 }));
    const prisma = { scanEvent: { updateMany } } as any;
    expect(await dropOldScanVectors(prisma, NOW)).toBe(3);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        createdAt: { lt: new Date(NOW - SCAN_VECTOR_RETENTION_MS) },
        vector: { isEmpty: false },
      },
      data: { vector: [] },
    });
  });

  it("only sweeps every so often", async () => {
    const updateMany = vi.fn(async () => ({ count: 0 }));
    const prisma = { scanEvent: { updateMany } } as any;
    const later = NOW + 365 * 24 * 60 * 60 * 1000; // past any earlier sweep
    await maybeSweepScanLog(prisma, later);
    expect(maybeSweepScanLog(prisma, later + 1000)).toBeNull();
    expect(updateMany).toHaveBeenCalledOnce();
  });

  it("lets a scan become a user_scan only while fresh and it still has a vector", () => {
    const fresh = { createdAt: new Date(NOW - 60_000), vector: [0.1, 0.2] };
    expect(scanIsActionable(fresh, NOW)).toBe(true);
    expect(scanIsActionable({ ...fresh, vector: [] }, NOW)).toBe(false);
    expect(
      scanIsActionable(
        { ...fresh, createdAt: new Date(NOW - SCAN_ACTION_WINDOW_MS - 1) },
        NOW
      )
    ).toBe(false);
  });
});
