import type { RouterInputs, RouterOutputs } from "@/utils/trpc";

export type WaitlistRouterInputs = RouterInputs["waitlist"];

export type WaitlistRouterOutputs = RouterOutputs["waitlist"];
export type LinksRouterOutputs = RouterOutputs["links"];

export type VinylRouterOutputs = RouterOutputs["vinyl"];
export type VinylMatch = VinylRouterOutputs["identify"]["matches"][number];
export type VinylAlbum = VinylMatch["album"];
