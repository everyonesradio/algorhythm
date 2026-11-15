import { describe, expect, it, vi } from "vitest";

import { CONSENT_VERSION, signup } from "@/server/services/waitlist/waitlist";

type Row = Record<string, any>;
const NOW = Date.parse("2026-11-15T12:00:00Z");

/** Just enough Prisma for the waitlist, incl. the unique index on email. */
const fakePrisma = () => {
  const rows: Row[] = [];
  let n = 0;
  const prisma = {
    waitlist: {
      findUnique: async ({ where }: Row) =>
        rows.find((r) => r.email === where.email) ?? null,
      create: async ({ data }: Row) => {
        if (rows.some((r) => r.email === data.email))
          throw Object.assign(new Error("dup"), { code: "P2002" });
        const row = { id: `w${++n}`, welcomeSentAt: null, ...data };
        rows.push(row);
        return row;
      },
      updateMany: async ({ where, data }: Row) => {
        const hit = rows.filter(
          (r) =>
            r.id === where.id &&
            (where.welcomeSentAt !== null || r.welcomeSentAt === null)
        );
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      },
      update: async ({ where, data }: Row) =>
        Object.assign(
          rows.find((r) => r.id === where.id)!,
          data
        ),
    },
  } as any;
  return { rows, prisma };
};

const input = { email: "digger@example.com", source: "landing" };

describe("signup", () => {
  it("stores the address with what they agreed to, and sends one welcome", async () => {
    const { prisma, rows } = fakePrisma();
    const sendWelcome = vi.fn(async () => {});
    expect(await signup(prisma, input, { sendWelcome }, NOW)).toEqual({
      sent: true,
    });
    expect(sendWelcome).toHaveBeenCalledWith("digger@example.com");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      consentVersion: CONSENT_VERSION,
      source: "landing",
      timestamp: new Date(NOW),
      welcomeSentAt: new Date(NOW),
    });
  });

  it("never emails the same address twice", async () => {
    const { prisma, rows } = fakePrisma();
    const sendWelcome = vi.fn(async () => {});
    await signup(prisma, input, { sendWelcome }, NOW);
    expect(await signup(prisma, input, { sendWelcome }, NOW + 1e9)).toEqual({
      sent: false,
    });
    expect(sendWelcome).toHaveBeenCalledOnce();
    expect(rows).toHaveLength(1);
  });

  it("sends only once when two signups for one address arrive together", async () => {
    const { prisma, rows } = fakePrisma();
    const sendWelcome = vi.fn(async () => {});
    const results = await Promise.all([
      signup(prisma, input, { sendWelcome }, NOW),
      signup(prisma, input, { sendWelcome }, NOW),
    ]);
    expect(results.filter((r) => r.sent)).toHaveLength(1);
    expect(sendWelcome).toHaveBeenCalledOnce();
    expect(rows).toHaveLength(1);
  });

  it("keeps the signup and retries the email next time if sending fails", async () => {
    const { prisma, rows } = fakePrisma();
    const failing = vi.fn(async () => {
      throw new Error("SendGrid 503");
    });
    await expect(
      signup(prisma, input, { sendWelcome: failing }, NOW)
    ).rejects.toThrow("SendGrid 503");
    expect(rows).toHaveLength(1);
    expect(rows[0].welcomeSentAt).toBeNull();

    const ok = vi.fn(async () => {});
    expect(await signup(prisma, input, { sendWelcome: ok }, NOW)).toEqual({
      sent: true,
    });
  });
});
