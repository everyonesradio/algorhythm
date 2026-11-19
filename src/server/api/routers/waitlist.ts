// ** Third-Party Imports
import { waitUntil } from "@vercel/functions";
import { z } from "zod";

// ** Custom Components, Hooks, Utils, etc.
import { env } from "@/env";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import {
  sendgridConfigured,
  sendWaitlistWelcome,
} from "@/server/services/waitlist/sendgrid";
import { signup } from "@/server/services/waitlist/waitlist";
import { logger } from "@/utils/logger";

const ANSWER = { message: "Added to waitlist!" };

export const waitlistRouter = createTRPCRouter({
  add: publicProcedure
    .input(
      z.object({
        // Normalise before validating so "You@Mail.com " and "you@mail.com"
        // are the same person.
        email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
        // Hidden field people never see; bots fill it in.
        hp: z.string().max(200).optional(),
      })
    )
    .mutation(({ ctx, input }) => {
      if (input.hp) return ANSWER;
      // In the background, so the answer takes the same time whether or not
      // an email goes out.
      waitUntil(
        signup(
          ctx.prisma,
          { email: input.email, source: "landing" },
          {
            sendWelcome: async (to) => {
              if (!sendgridConfigured() && env.NODE_ENV !== "production") {
                logger.warn(
                  "waitlist: SendGrid not configured, no welcome email"
                );
                return;
              }
              await sendWaitlistWelcome(to);
            },
          }
        ).catch((err: unknown) =>
          logger.error({ err }, "waitlist: signup failed")
        )
      );
      return ANSWER;
    }),
});
