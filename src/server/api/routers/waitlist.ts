// ** Third-Party Imports
import { z } from "zod";

// ** Custom Components, Hooks, Utils, etc.
import { createTRPCRouter, publicProcedure } from "../../api/trpc";

export const waitlistRouter = createTRPCRouter({
  add: publicProcedure
    .input(
      z.object({
        email: z.string().trim().toLowerCase().pipe(z.email()),
      })
    )
    .mutation(async ({ ctx, input }) => {
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
