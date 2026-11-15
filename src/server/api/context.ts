// ** Custom Components, Hooks, Utils, etc.
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";

import { libraryRouter } from "./routers/library";
import { linksRouter } from "./routers/links";
import { waitlistRouter } from "./routers/waitlist";
import { vinylRouter } from "./routers/vinyl";

export const appRouter = createTRPCRouter({
  waitlist: waitlistRouter,
  vinyl: vinylRouter,
  links: linksRouter,
  library: libraryRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
