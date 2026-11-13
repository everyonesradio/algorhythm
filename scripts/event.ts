/**
 * Create and manage pop-ups ("Stump the Algorithm" nights).
 *
 *   npm run vinyl:event -- create --name "Stump the Algorithm · Bristol" \
 *     --venue "Idle Hands" --city Bristol \
 *     --starts 2027-01-21T18:00 --ends 2027-01-21T20:00
 *   npm run vinyl:event -- list
 *   npm run vinyl:event -- end --slug stump-the-algorithm-bristol
 *   npm run vinyl:event -- new-code --slug stump-the-algorithm-bristol
 *
 * `create` and `new-code` print the join link (put it in a QR code at the
 * venue). Only a hash of the code is stored, so a lost code can't be shown
 * again: make a new one with `new-code`. Times without a zone are read as the
 * machine's local time; pass `--base https://your.site` for the link's domain
 * (defaults to NEXT_PUBLIC_BASE_URL).
 */
import "./lib/load-env";

import { parseArgs } from "node:util";

import { PrismaClient } from "@prisma/client";

import {
  createEvent,
  eventStatus,
  hashJoinCode,
  newJoinCode,
} from "@/server/services/library/events";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    name: { type: "string" },
    slug: { type: "string" },
    venue: { type: "string" },
    city: { type: "string" },
    description: { type: "string" },
    starts: { type: "string" },
    ends: { type: "string" },
    base: { type: "string" },
  },
});

const prisma = new PrismaClient();
const base = (
  values.base ??
  process.env.NEXT_PUBLIC_BASE_URL ??
  "http://localhost:3000"
).replace(/\/$/, "");
const joinLink = (slug: string, code: string) =>
  `${base}/library/event/${slug}?join=${code}`;

const date = (v: string | undefined, flag: string) => {
  const d = v ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime()))
    throw new Error(`--${flag} needs a date and time, e.g. 2027-01-21T18:00`);
  return d;
};

const main = async () => {
  const command = positionals[0];
  if (command === "create") {
    if (!values.name) throw new Error("--name is required");
    const { event, code } = await createEvent(prisma, {
      name: values.name,
      slug: values.slug,
      venue: values.venue,
      city: values.city,
      description: values.description,
      startsAt: date(values.starts, "starts"),
      endsAt: date(values.ends, "ends"),
    });
    console.log(`Created "${event.name}" (${event.slug})`);
    console.log(
      `  ${event.startsAt.toLocaleString()} – ${event.endsAt.toLocaleString()}`
    );
    console.log(`  Event page: ${base}/library/event/${event.slug}`);
    console.log(`  Join link (QR at the venue): ${joinLink(event.slug, code)}`);
    console.log(`  Join code: ${code}`);
    return;
  }
  if (command === "list") {
    const events = await prisma.event.findMany({
      orderBy: { startsAt: "desc" },
      take: 50,
    });
    for (const e of events) {
      const finds = await prisma.libraryEntry.count({
        where: { event: e.slug, hidden: false },
      });
      console.log(
        `${eventStatus(e).padEnd(8)} ${e.slug}  "${e.name}"  ${e.startsAt.toLocaleString()}  ${finds} finds`
      );
    }
    if (!events.length) console.log("No pop-ups yet.");
    return;
  }
  if (command === "end" || command === "new-code") {
    if (!values.slug) throw new Error("--slug is required");
    const event = await prisma.event.findUnique({
      where: { slug: values.slug },
    });
    if (!event) throw new Error(`No pop-up with slug ${values.slug}`);
    if (command === "end") {
      await prisma.event.update({
        where: { slug: values.slug },
        data: { endsAt: new Date() },
      });
      console.log(
        `Ended "${event.name}". Finds can still be credited for the next hour.`
      );
    } else {
      const code = newJoinCode();
      await prisma.event.update({
        where: { slug: values.slug },
        data: { joinCodeHash: hashJoinCode(code) },
      });
      console.log(
        `New join link: ${joinLink(event.slug, code)} (old code no longer works)`
      );
    }
    return;
  }
  console.log(
    "Usage: npm run vinyl:event -- create|list|end|new-code [options] (see scripts/event.ts)"
  );
};

main()
  .catch((err) => {
    console.error((err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
