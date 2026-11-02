import { describe, expect, it, vi } from "vitest";

import {
  type CoverSources,
  resolveCover,
} from "@/server/services/catalog/ingest";

const img = (s: string) => Buffer.from(s);
const sources = (over: Partial<CoverSources> = {}): CoverSources => ({
  coverArtArchive: vi.fn(async () => null),
  spotify: vi.fn(async () => "https://i.scdn.co/image/sza"),
  discogs: vi.fn(async () => "https://i.discogs.com/sza.jpg"),
  download: vi.fn(async (url: string) => img(url)),
  ...over,
});

describe("resolveCover", () => {
  it("uses Cover Art Archive when it has the cover", async () => {
    const src = sources({
      coverArtArchive: vi.fn(async () => ({
        url: "https://caa/front",
        image: img("caa"),
      })),
    });
    expect(await resolveCover(src)).toMatchObject({
      from: "caa",
      url: "https://caa/front",
    });
    expect(src.spotify).not.toHaveBeenCalled();
    expect(src.discogs).not.toHaveBeenCalled();
  });

  it("falls back to the Spotify art when CAA has no cover", async () => {
    const src = sources();
    expect(await resolveCover(src)).toMatchObject({
      from: "spotify",
      url: "https://i.scdn.co/image/sza",
    });
    expect(src.discogs).not.toHaveBeenCalled();
  });

  it("then to Discogs", async () => {
    const src = sources({ spotify: vi.fn(async () => null) });
    expect(await resolveCover(src)).toMatchObject({ from: "discogs" });
  });

  it("skips a fallback whose image won't download", async () => {
    const src = sources({
      download: vi.fn(async (url: string) =>
        url.includes("scdn") ? null : img(url)
      ),
    });
    expect(await resolveCover(src)).toMatchObject({ from: "discogs" });
  });

  it("is null when nobody has a cover", async () => {
    const src = sources({
      spotify: vi.fn(async () => null),
      discogs: vi.fn(async () => null),
    });
    expect(await resolveCover(src)).toBeNull();
  });

  it("rethrows a CAA outage when no fallback helps, so the album is retried", async () => {
    const src = sources({
      coverArtArchive: vi.fn(async () => {
        throw new Error("Image 503");
      }),
      spotify: vi.fn(async () => null),
      discogs: vi.fn(async () => {
        throw new Error("discogs down");
      }),
    });
    await expect(resolveCover(src)).rejects.toThrow("Image 503");
  });

  it("covers a CAA outage with a fallback", async () => {
    const src = sources({
      coverArtArchive: vi.fn(async () => {
        throw new Error("Image 503");
      }),
    });
    expect(await resolveCover(src)).toMatchObject({ from: "spotify" });
  });
});
