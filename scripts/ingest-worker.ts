/**
 * Finish catalog ingest jobs that didn't complete in the background.
 *
 *   npm run vinyl:worker                     # run every due job, then exit
 *   npm run vinyl:worker -- --artist-mbid <id> --name "Kendrick Lamar"
 *
 * Scans start ingest jobs themselves (see src/server/services/catalog). This
 * picks up anything that was cut short: a serverless timeout, a crashed
 * instance, or a failure worth retrying. Safe to run on a schedule.
 */
import "./lib/load-env";

import { parseArgs } from "node:util";

import { PrismaClient } from "@prisma/client";

import { serverRunnerDeps } from "@/server/services/catalog/background";
import {
  claimJob,
  isDue,
  requeue,
  requestArtistCatalog,
  runArtistJob,
} from "@/server/services/catalog/queue";

const { values } = parseArgs({
  options: {
    "artist-mbid": { type: "string" },
    name: { type: "string" },
  },
});

const prisma = new PrismaClient();
const deps = {
  ...serverRunnerDeps(prisma),
  log: (m: string) => console.log(m),
};

const main = async () => {
  if (values["artist-mbid"]) {
    await requestArtistCatalog(
      prisma,
      {
        mbid: values["artist-mbid"],
        name: values.name ?? values["artist-mbid"],
      },
      "cli"
    );
  }

  const jobs = await prisma.ingestJob.findMany({
    where: { status: { in: ["pending", "running", "failed"] } },
    orderBy: { updatedAt: "asc" },
  });
  const due = jobs.filter((j) => isDue(j));
  console.log(`[worker] ${due.length} due of ${jobs.length} open jobs`);

  for (const job of due) {
    // Stale "running" / retryable "failed" jobs go back to pending first.
    if (job.status !== "pending") {
      await prisma.ingestJob.update({
        where: { id: job.id },
        data: requeue(job),
      });
    }
    if (!(await claimJob(prisma, job.id))) continue;
    await runArtistJob(prisma, job.id, deps);
  }
};

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
