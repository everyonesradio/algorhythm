import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/services/links/server", () => ({
  resolveLinkOnServer: vi.fn(),
}));

const { resolveLinkOnServer } = await import("@/server/services/links/server");
const { UnsupportedLinkError } =
  await import("@/server/services/links/resolve-link");
const { linksRouter } = await import("@/server/api/routers/links");
const { createCallerFactory } = await import("@/server/api/trpc");

describe("links router", () => {
  const caller = createCallerFactory(linksRouter)({ prisma: {} } as never);

  beforeEach(() => {
    vi.mocked(resolveLinkOnServer).mockReset();
  });

  it("rejects an oversized link without resolving it", async () => {
    const link = `https://open.spotify.com/album/${"a".repeat(2100)}`;
    await expect(caller.search({ link })).rejects.toThrow(/too_big/);
    expect(resolveLinkOnServer).not.toHaveBeenCalled();
  });

  it("keeps the reason when the link isn't supported", async () => {
    vi.mocked(resolveLinkOnServer).mockRejectedValueOnce(
      new UnsupportedLinkError("That isn't a music link we know")
    );
    await expect(
      caller.search({ link: "https://example.com/x" })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Couldn't resolve that link: That isn't a music link we know",
    });
  });

  it("does not return internal error details", async () => {
    vi.mocked(resolveLinkOnServer).mockRejectedValueOnce(
      new Error("connect ECONNREFUSED 10.0.0.5:27017")
    );
    const err = await caller
      .search({ link: "https://open.spotify.com/album/abc" })
      .then(
        () => null,
        (e: unknown) => e as Error
      );
    expect(err).toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(err?.message).not.toMatch(/ECONNREFUSED|10\.0\.0\.5/);
  });
});
