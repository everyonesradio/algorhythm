import { createHash, randomInt } from "node:crypto";

import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Pop-ups ("Stump the Algorithm" at a record shop).
 *
 * Each event has a join link with a short code (the QR at the venue). A phone
 * that opens it during the event credits its library finds to the event, so
 * the event page can show every record found that night and the scoreboard.
 * The code keeps people at home from adding finds to someone else's night.
 */

/** Joining and crediting finds stays open this long either side of the event. */
export const EVENT_GRACE_MS = 60 * 60 * 1000;
/** Finds listed on an event page. */
export const EVENT_FINDS_MAX = 300;

/** No 0/O, 1/I/L: easy to read off a screen and type. */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export const newJoinCode = (length = 6) =>
  Array.from(
    { length },
    () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  ).join("");

export const normalizeCode = (code: string) =>
  code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

export const hashJoinCode = (code: string) =>
  createHash("sha256")
    .update(`algorhythm-event:${normalizeCode(code)}`)
    .digest("hex");

export type EventStatus = "upcoming" | "live" | "ended";

export const eventStatus = (
  e: { startsAt: Date; endsAt: Date },
  now = Date.now()
): EventStatus =>
  now < e.startsAt.getTime()
    ? "upcoming"
    : now <= e.endsAt.getTime()
      ? "live"
      : "ended";

/** Can finds be credited to this event right now? */
export const eventOpen = (
  e: { startsAt: Date; endsAt: Date },
  now = Date.now()
) =>
  now >= e.startsAt.getTime() - EVENT_GRACE_MS &&
  now <= e.endsAt.getTime() + EVENT_GRACE_MS;

/** "stump-the-algorithm-bristol" */
export const eventSlug = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

export class EventError extends Error {
  constructor(
    readonly code: "not-found" | "closed" | "bad-code",
    message: string
  ) {
    super(message);
  }
}

const publicEvent = {
  slug: true,
  name: true,
  venue: true,
  city: true,
  description: true,
  startsAt: true,
  endsAt: true,
} as const;

/** The event a join link points to, if the code is right and it's on now. */
export const checkJoin = async (
  prisma: PrismaClient,
  input: { slug: string; code: string },
  now = Date.now()
) => {
  const event = await prisma.event.findUnique({
    where: { slug: input.slug },
    select: { ...publicEvent, joinCodeHash: true },
  });
  if (!event) throw new EventError("not-found", "That pop-up doesn't exist.");
  if (event.joinCodeHash !== hashJoinCode(input.code)) {
    throw new EventError(
      "bad-code",
      "That join code isn't right for this pop-up."
    );
  }
  if (!eventOpen(event, now)) {
    throw new EventError(
      "closed",
      eventStatus(event, now) === "upcoming"
        ? "This pop-up hasn't started yet."
        : "This pop-up has finished."
    );
  }
  const { joinCodeHash: _hash, ...rest } = event;
  return rest;
};

export const createEvent = async (
  prisma: PrismaClient,
  input: {
    name: string;
    slug?: string;
    venue?: string | null;
    city?: string | null;
    description?: string | null;
    startsAt: Date;
    endsAt: Date;
  }
) => {
  if (!(input.endsAt > input.startsAt))
    throw new Error("The event must end after it starts.");
  const slug = eventSlug(input.slug || input.name);
  if (!slug) throw new Error("The event needs a name with letters or numbers.");
  const code = newJoinCode();
  const event = await prisma.event.create({
    data: {
      slug,
      name: input.name.trim(),
      venue: input.venue?.trim() || null,
      city: input.city?.trim() || null,
      description: input.description?.trim() || null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      joinCodeHash: hashJoinCode(code),
    },
    select: publicEvent,
  });
  return { event, code };
};

/** Pop-ups for the library page: live and upcoming first, then recent. */
export const listEvents = async (prisma: PrismaClient, now = Date.now()) => {
  const events = await prisma.event.findMany({
    where: { endsAt: { gte: new Date(now - 180 * 24 * 60 * 60 * 1000) } },
    orderBy: { startsAt: "desc" },
    take: 12,
    select: publicEvent,
  });
  const rank = { live: 0, upcoming: 1, ended: 2 } as const;
  return events
    .map((e) => ({ ...e, status: eventStatus(e, now) }))
    .sort((a, b) => rank[a.status] - rank[b.status]);
};

/**
 * The event page: details, the scoreboard and every find in order.
 * Scoreboard rules (published, so "stumped" isn't defined afterwards):
 * every record added at the event counts once; it was named by the app
 * (a confident match), from its suggestions (the person picked one of the
 * app's candidates) or by hand (the app didn't have it: the room taught it).
 * The stump rate is "by hand" over all records added.
 */
export const eventBoard = async <S extends Prisma.AlbumSelect>(
  prisma: PrismaClient,
  slug: string,
  albumSelect: S,
  now = Date.now()
) => {
  const event = await prisma.event.findUnique({
    where: { slug },
    select: publicEvent,
  });
  if (!event) return null;
  const finds = await prisma.libraryEntry.findMany({
    where: { event: slug, hidden: false },
    orderBy: { createdAt: "asc" },
    take: EVENT_FINDS_MAX,
    select: {
      id: true,
      note: true,
      coverUrl: true,
      namedBy: true,
      createdAt: true,
      album: { select: albumSelect },
    },
  });
  const by = (k: string) => finds.filter((f) => f.namedBy === k).length;
  const added = finds.length;
  const hand = by("hand");
  return {
    event: { ...event, status: eventStatus(event, now) },
    score: {
      added,
      app: by("app"),
      suggestions: by("suggestions"),
      hand,
      stumpRate: added ? hand / added : null,
    },
    finds,
  };
};
