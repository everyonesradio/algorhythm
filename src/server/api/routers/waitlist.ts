// ** Third-Party Imports
import { z } from "zod";

// ** Custom Components, Hooks, Utils, etc.
import { createTRPCRouter, publicProcedure } from "../../api/trpc";

export const waitlistRouter = createTRPCRouter({
  add: publicProcedure
    .input(
      z.object({
        // Normalise before validating so "You@Mail.com " and "you@mail.com"
        // are the same person.
        email: z.string().trim().toLowerCase().pipe(z.email()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Signing up twice is fine: answer the same way, store one row.
      const existing = await ctx.prisma.waitlist.findFirst({
        where: { email: input.email },
        select: { id: true },
      });
      if (!existing) {
        await ctx.prisma.waitlist.create({
          data: { email: input.email, timestamp: new Date() },
        });
      }

      return { message: "Added to waitlist!" };
    }),
});
