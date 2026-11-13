import { describe, expect, it } from "vitest";

import {
  checkJoin,
  EVENT_GRACE_MS,
  eventBoard,
  EventError,
  eventOpen,
  eventSlug,
  eventStatus,
  hashJoinCode,
  listEvents,
  newJoinCode,
  normalizeCode,
} from "@/server/services/library/events";

type Row = Record<string, any>;
const START = new Date("2026-11-20T18:00:00Z");
const END = new Date("2026-11-20T22:00:00Z");
const H = 60 * 60 * 1000;

const event = (over: Row = {}): Row => ({
  slug: "stump-bristol",
  name: "Stump the Algorithm",
  venue: "Idle Hands",
  city: "Bristol",
  description: null,
  startsAt: START,
  endsAt: END,
  joinCodeHash: hashJoinCode("K7Q2XM"),
  ...over,
});

const fakePrisma = (events: Row[], entries: Row[] = []) =>
  ({
    event: {
      findUnique: async ({ where }: Row) =>
        events.find((e) => e.slug === where.slug) ?? null,
      findMany: async () => events,
    },
    libraryEntry: {
      findMany: async ({ where }: Row) =>
        entries
          .filter((e) => e.event === where.event && e.hidden === where.hidden)
          .sort((a, b) => a.createdAt - b.createdAt),
    },
  }) as any;

describe("join codes", () => {
  it("are readable: no 0/O or 1/I/L", () => {
    for (let i = 0; i < 50; i++)
      expect(newJoinCode()).toMatch(/^[2-9A-HJKMNP-Z]{6}$/);
  });

  it("match however they're typed", () => {
    expect(normalizeCode(" k7q-2xm ")).toBe("K7Q2XM");
    expect(hashJoinCode("k7q 2xm")).toBe(hashJoinCode("K7Q2XM"));
    expect(hashJoinCode("K7Q2XN")).not.toBe(hashJoinCode("K7Q2XM"));
  });
});

describe("event time", () => {
  const e = { startsAt: START, endsAt: END };
  it("is upcoming, live, then ended", () => {
    expect(eventStatus(e, START.getTime() - 1)).toBe("upcoming");
    expect(eventStatus(e, START.getTime())).toBe("live");
    expect(eventStatus(e, END.getTime())).toBe("live");
    expect(eventStatus(e, END.getTime() + 1)).toBe("ended");
  });

  it("stays open an hour either side", () => {
    expect(eventOpen(e, START.getTime() - EVENT_GRACE_MS)).toBe(true);
    expect(eventOpen(e, START.getTime() - EVENT_GRACE_MS - 1)).toBe(false);
    expect(eventOpen(e, END.getTime() + EVENT_GRACE_MS)).toBe(true);
    expect(eventOpen(e, END.getTime() + EVENT_GRACE_MS + 1)).toBe(false);
  });
});

describe("eventSlug", () => {
  it("makes a tidy slug", () => {
    expect(eventSlug("Stump the Algorithm: Café Ñu & Friends!")).toBe(
      "stump-the-algorithm-cafe-nu-and-friends"
    );
    expect(eventSlug("!!!")).toBe("");
    expect(eventSlug("x".repeat(80))).toHaveLength(60);
  });
});

describe("checkJoin", () => {
  const during = START.getTime() + H;

  it("returns the event without the code hash", async () => {
    const res = await checkJoin(
      fakePrisma([event()]),
      { slug: "stump-bristol", code: "k7q2xm" },
      during
    );
    expect(res.slug).toBe("stump-bristol");
    expect(res).not.toHaveProperty("joinCodeHash");
  });

  it.each([
    ["not-found", { slug: "nope", code: "K7Q2XM" }, during],
    ["bad-code", { slug: "stump-bristol", code: "AAAAAA" }, during],
    [
      "closed",
      { slug: "stump-bristol", code: "K7Q2XM" },
      START.getTime() - 2 * H,
    ],
    [
      "closed",
      { slug: "stump-bristol", code: "K7Q2XM" },
      END.getTime() + 2 * H,
    ],
  ])("refuses %s", async (code, input, now) => {
    const err = await checkJoin(fakePrisma([event()]), input, now).catch(
      (e) => e
    );
    expect(err).toBeInstanceOf(EventError);
    expect(err.code).toBe(code);
  });

  it("says whether it hasn't started or has finished", async () => {
    const p = fakePrisma([event()]);
    const input = { slug: "stump-bristol", code: "K7Q2XM" };
    await expect(checkJoin(p, input, START.getTime() - 2 * H)).rejects.toThrow(
      /hasn't started/
    );
    await expect(checkJoin(p, input, END.getTime() + 2 * H)).rejects.toThrow(
      /finished/
    );
  });
});

describe("eventBoard", () => {
  const find = (id: string, namedBy: string, min: number, over: Row = {}) => ({
    id,
    event: "stump-bristol",
    hidden: false,
    namedBy,
    note: null,
    coverUrl: null,
    createdAt: new Date(START.getTime() + min * 60_000),
    album: { id: `album-${id}` },
    ...over,
  });

  it("scores finds and lists them in order", async () => {
    const entries = [
      find("c", "hand", 30),
      find("a", "app", 5),
      find("b", "suggestions", 10),
      find("d", "hand", 40),
      find("e", "hand", 50, { hidden: true }), // reported away
      find("f", "app", 20, { event: "other-night" }),
    ];
    const board = await eventBoard(
      fakePrisma([event()], entries),
      "stump-bristol",
      { id: true },
      START.getTime() + H
    );
    expect(board!.event.status).toBe("live");
    expect(board!.score).toEqual({
      added: 4,
      app: 1,
      suggestions: 1,
      hand: 2,
      stumpRate: 0.5,
    });
    expect(board!.finds.map((f: Row) => f.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("has no stump rate before anything is added", async () => {
    const board = await eventBoard(fakePrisma([event()]), "stump-bristol", {
      id: true,
    });
    expect(board!.score.stumpRate).toBeNull();
    expect(board!.score.added).toBe(0);
  });

  it("is null for an unknown event", async () => {
    expect(await eventBoard(fakePrisma([]), "nope", { id: true })).toBeNull();
  });
});

describe("listEvents", () => {
  it("puts live, then upcoming, then ended", async () => {
    const now = START.getTime() + H;
    const list = await listEvents(
      fakePrisma([
        event({
          slug: "past",
          startsAt: new Date(now - 48 * H),
          endsAt: new Date(now - 44 * H),
        }),
        event({
          slug: "next",
          startsAt: new Date(now + 48 * H),
          endsAt: new Date(now + 52 * H),
        }),
        event({ slug: "now" }),
      ]),
      now
    );
    expect(list.map((e) => [e.slug, e.status])).toEqual([
      ["now", "live"],
      ["next", "upcoming"],
      ["past", "ended"],
    ]);
  });
});
