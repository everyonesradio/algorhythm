// ** Custom Components, Hooks, Utils, etc.
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";

import { waitlistRouter } from "./routers/waitlist";
import { musicIDXRouter } from "./routers/music-idx";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  waitlist: waitlistRouter,
  musicIDX: musicIDXRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
