import { describe, expect, it, vi } from "vitest";

import {
  claimJob,
  isDue,
  FAILED_RETRY_MS,
  MAX_ATTEMPTS,
  REFRESH_AFTER_MS,
  requestArtistCatalog,
  runArtistJob,
  STALE_RUNNING_MS,
} from "@/server/services/catalog/queue";

const NOW = Date.parse("2026-11-01T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms);

type Row = Record<string, any>;

/** In-memory stand-in for prisma.ingestJob. */
const fakePrisma = () => {
  const jobs: Row[] = [];
  let n = 0;
  return {
    jobs,
    ingestJob: {
      findUnique: async ({ where }: Row) =>
        where.id
          ? (jobs.find((j) => j.id === where.id) ?? null)
          : (jobs.find(
              (j) =>
                j.kind === where.kind_key.kind && j.key === where.kind_key.key
            ) ?? null),
      findUniqueOrThrow: async ({ where }: Row) => {
        const j = jobs.find((x) => x.id === where.id);
        if (!j) throw new Error("not found");
        return j;
      },
      create: async ({ data }: Row) => {
        const row = {
          id: `job${++n}`,
          attempts: 0,
          startedAt: null,
          finishedAt: null,
          ...data,
        };
        jobs.push(row);
        return row;
      },
      update: async ({ where, data }: Row) =>
        Object.assign(
          jobs.find((j) => j.id === where.id)!,
          data
        ),
      updateMany: async ({ where, data }: Row) => {
        const hit = jobs.filter(
          (j) => j.id === where.id && j.status === where.status
        );
        for (const j of hit) {
          Object.assign(j, {
            ...data,
            attempts: j.attempts + data.attempts.increment,
          });
        }
        return { count: hit.length };
      },
    },
  } as any;
};

const kdot = { mbid: "kdot", name: "Kendrick Lamar" };

describe("isDue", () => {
  const job = (status: string, extra: Row = {}) =>
    ({
      status,
      attempts: 1,
      startedAt: null,
      finishedAt: null,
      ...extra,
    }) as any;

  it("runs pending jobs and retries failures up to the limit", () => {
    expect(isDue(job("pending"), NOW)).toBe(true);
    expect(isDue(job("failed", { attempts: 1 }), NOW)).toBe(true);
    expect(
      isDue(
        job("failed", {
          attempts: MAX_ATTEMPTS,
          finishedAt: new Date(NOW - 1000),
        }),
        NOW
      )
    ).toBe(false);
    // ...but not forever: retried a day after the last failure.
    expect(
      isDue(
        job("failed", {
          attempts: MAX_ATTEMPTS,
          finishedAt: new Date(NOW - FAILED_RETRY_MS - 1),
        }),
        NOW
      )
    ).toBe(true);
  });

  it("leaves a healthy running job alone but recovers a stale one", () => {
    expect(isDue(job("running", { startedAt: ago(60_000) }), NOW)).toBe(false);
    expect(
      isDue(job("running", { startedAt: ago(STALE_RUNNING_MS + 1) }), NOW)
    ).toBe(true);
  });

  it("refreshes a finished artist only after the refresh window", () => {
    expect(isDue(job("done", { finishedAt: ago(1000) }), NOW)).toBe(false);
    expect(
      isDue(job("done", { finishedAt: ago(REFRESH_AFTER_MS + 1) }), NOW)
    ).toBe(true);
  });
});

describe("requestArtistCatalog", () => {
  it("creates one job per artist; repeat scans are a no-op while it runs or after it's done", async () => {
    const prisma = fakePrisma();
    const id = await requestArtistCatalog(prisma, kdot, "scan_pick", NOW);
    expect(id).toBe("job1");
    expect(prisma.jobs).toHaveLength(1);

    prisma.jobs[0].status = "running";
    prisma.jobs[0].startedAt = ago(1000);
    expect(
      await requestArtistCatalog(prisma, kdot, "scan_match", NOW)
    ).toBeNull();

    prisma.jobs[0].status = "done";
    prisma.jobs[0].finishedAt = ago(1000);
    expect(
      await requestArtistCatalog(prisma, kdot, "scan_match", NOW)
    ).toBeNull();
    expect(prisma.jobs).toHaveLength(1);
  });

  it("re-queues a failed job", async () => {
    const prisma = fakePrisma();
    await requestArtistCatalog(prisma, kdot, "scan_pick", NOW);
    Object.assign(prisma.jobs[0], {
      status: "failed",
      attempts: 1,
      error: "boom",
    });
    expect(await requestArtistCatalog(prisma, kdot, "scan_confirm", NOW)).toBe(
      "job1"
    );
    expect(prisma.jobs[0]).toMatchObject({ status: "pending", error: null });
  });

  it("gives an exhausted job a fresh round of attempts after the cooldown", async () => {
    const prisma = fakePrisma();
    await requestArtistCatalog(prisma, kdot, "scan_pick", NOW);
    const failedAt = new Date(NOW);
    Object.assign(prisma.jobs[0], {
      status: "failed",
      attempts: MAX_ATTEMPTS,
      finishedAt: failedAt,
    });
    expect(
      await requestArtistCatalog(prisma, kdot, "scan_match", NOW + 1000)
    ).toBeNull();
    const later = NOW + FAILED_RETRY_MS + 1000;
    expect(await requestArtistCatalog(prisma, kdot, "scan_match", later)).toBe(
      "job1"
    );
    expect(prisma.jobs[0]).toMatchObject({ status: "pending", attempts: 0 });
  });
});

describe("claimJob", () => {
  it("lets exactly one caller claim a pending job", async () => {
    const prisma = fakePrisma();
    const id = (await requestArtistCatalog(prisma, kdot, "scan_pick", NOW))!;
    const [a, b] = await Promise.all([
      claimJob(prisma, id),
      claimJob(prisma, id),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(prisma.jobs[0]).toMatchObject({ status: "running", attempts: 1 });
  });
});

describe("runArtistJob", () => {
  const deps = (outcomes: Record<string, string | Error>) => ({
    embedder: vi.fn(async () => ({ model: "clip-vit-b32" }) as any),
    discography: vi.fn(async () =>
      Object.keys(outcomes).map((id) => ({ id, title: id }))
    ),
    ingest: vi.fn(async (_e: unknown, mbid: string, _opts?: unknown) => {
      const o = outcomes[mbid];
      if (o instanceof Error) throw o;
      return { status: o, mbid } as any;
    }),
  });

  it("ingests every release, counts outcomes, and marks the job done", async () => {
    const prisma = fakePrisma();
    const id = (await requestArtistCatalog(prisma, kdot, "scan_pick", NOW))!;
    await claimJob(prisma, id);
    const d = deps({
      gnx: "added",
      gkmc: "skipped",
      demo: "no-cover",
      broken: new Error("timeout"),
    });

    const stats = await runArtistJob(prisma, id, d);

    expect(d.discography).toHaveBeenCalledWith("kdot", expect.any(Number));
    expect(d.ingest).toHaveBeenCalledTimes(4);
    // Every release is vectorised with the full augment set.
    expect(d.ingest.mock.calls[0][2]).toEqual({ augment: true });
    expect(stats).toEqual({
      releases: 4,
      added: 1,
      skipped: 1,
      noCover: 1,
      failed: 1,
    });
    expect(prisma.jobs[0]).toMatchObject({
      status: "done",
      attempts: 0,
      error: null,
    });
  });

  it("marks the job failed when the discography can't be fetched", async () => {
    const prisma = fakePrisma();
    const id = (await requestArtistCatalog(prisma, kdot, "scan_pick", NOW))!;
    await claimJob(prisma, id);
    const d = deps({});
    d.discography.mockRejectedValueOnce(new Error("MusicBrainz 503"));

    await runArtistJob(prisma, id, d);
    expect(prisma.jobs[0]).toMatchObject({
      status: "failed",
      error: "MusicBrainz 503",
    });
  });
});
