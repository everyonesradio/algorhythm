import type { PrismaClient } from "@prisma/client";

/**
 * Early-access waitlist. Signing up puts the address on the list and sends
 * one welcome email. Every signup gets the same answer whether the address
 * is new or already on the list, so the form can't reveal who's signed up.
 */

/** Bump when the consent line under the form changes. */
export const CONSENT_VERSION = "2026-11-15";

const isDuplicate = (err: unknown) =>
  (err as { code?: string })?.code === "P2002";

export type SignupDeps = {
  /** Sends the welcome email; throws if it couldn't be sent. */
  sendWelcome: (to: string) => Promise<void>;
};

/**
 * Store the signup and send the welcome email if this address hasn't had
 * one. Returns whether an email went out (for logs and tests only).
 */
export const signup = async (
  prisma: PrismaClient,
  input: { email: string; source: string },
  deps: SignupDeps,
  now = Date.now()
): Promise<{ sent: boolean }> => {
  let row = await prisma.waitlist.findUnique({ where: { email: input.email } });
  if (!row) {
    try {
      row = await prisma.waitlist.create({
        data: {
          email: input.email,
          timestamp: new Date(now),
          consentVersion: CONSENT_VERSION,
          source: input.source,
        },
      });
    } catch (err) {
      // Two signups for the same address at once: the other one won.
      if (!isDuplicate(err)) throw err;
      return { sent: false };
    }
  }
  if (row.welcomeSentAt) return { sent: false };

  // Claim the send first, so two signups at once can't both email; release
  // the claim if sending fails, so signing up again retries it.
  const { count } = await prisma.waitlist.updateMany({
    where: { id: row.id, welcomeSentAt: null },
    data: { welcomeSentAt: new Date(now) },
  });
  if (!count) return { sent: false };
  try {
    await deps.sendWelcome(row.email);
  } catch (err) {
    await prisma.waitlist.update({
      where: { id: row.id },
      data: { welcomeSentAt: null },
    });
    throw err;
  }
  return { sent: true };
};
