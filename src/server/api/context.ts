// ** Custom Components, Hooks, Utils, etc.
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";

import { eventsRouter } from "./routers/events";
import { libraryRouter } from "./routers/library";
import { linksRouter } from "./routers/links";
import { waitlistRouter } from "./routers/waitlist";
import { vinylRouter } from "./routers/vinyl";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  waitlist: waitlistRouter,
  vinyl: vinylRouter,
  links: linksRouter,
  library: libraryRouter,
  events: eventsRouter,
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
