import { describe, expect, it, vi } from "vitest";

import { countOfficialVinyl } from "@/server/services/catalog/discogs";
import {
  decideVinyl,
  isVinylMedium,
  vinylReleasesByGroup,
} from "@/server/services/catalog/vinyl-status";

describe("vinylReleasesByGroup", () => {
  it("counts official releases with a vinyl medium per album", () => {
    const counts = vinylReleasesByGroup([
      {
        id: "1",
        title: "SOS",
        "release-group": { id: "sos", title: "SOS" },
        media: [{ format: '12" Vinyl' }, { format: '12" Vinyl' }],
      },
      {
        id: "2",
        title: "SOS",
        "release-group": { id: "sos", title: "SOS" },
        media: [{ format: "CD" }],
      },
      {
        id: "3",
        title: "SOS",
        "release-group": { id: "sos", title: "SOS" },
        media: [{ format: "Vinyl" }],
      },
      {
        id: "4",
        title: "Z",
        "release-group": { id: "z", title: "Z" },
        media: [{ format: "Digital Media" }],
      },
    ]);
    expect(counts.get("sos")).toBe(2);
    expect(counts.get("z")).toBe(0);
  });

  it("knows vinyl formats", () => {
    expect(['7" Vinyl', '10" Vinyl', "Vinyl"].every(isVinylMedium)).toBe(true);
    expect(["CD", "Cassette", null, undefined].some(isVinylMedium)).toBe(false);
  });
});

describe("decideVinyl", () => {
  it("trusts MusicBrainz without asking Discogs", async () => {
    const discogs = vi.fn(async () => 0);
    expect(await decideVinyl(3, discogs)).toEqual({
      status: "yes",
      releases: 3,
      source: "musicbrainz",
    });
    expect(discogs).not.toHaveBeenCalled();
  });

  it("falls back to Discogs, and says unknown when it can't answer", async () => {
    expect(await decideVinyl(0, async () => 4)).toEqual({
      status: "yes",
      releases: 4,
      source: "discogs",
    });
    expect(await decideVinyl(0, async () => 0)).toEqual({
      status: "no",
      releases: 0,
      source: "discogs",
    });
    expect(await decideVinyl(0, async () => null)).toMatchObject({
      status: "unknown",
    });
    expect(
      await decideVinyl(0, async () => {
        throw new Error("down");
      })
    ).toMatchObject({ status: "unknown" });
  });
});

describe("countOfficialVinyl", () => {
  it("ignores bootlegs and other albums", () => {
    const results = [
      {
        id: 1,
        type: "release" as const,
        title: "SZA (2) - Z",
        format: ["Vinyl", "LP", "Unofficial Release"],
      },
      {
        id: 2,
        type: "release" as const,
        title: "Jorja Smith - Lost & Found",
        format: ["Vinyl", "LP", "Album"],
      },
      {
        id: 3,
        type: "release" as const,
        title: "Jorja Smith - Lost & Found",
        format: ["Vinyl", "LP", "Album", "Reissue"],
      },
      {
        id: 4,
        type: "release" as const,
        title: "Jorja Smith - Be Right Back",
        format: ["Vinyl", "LP"],
      },
    ];
    expect(countOfficialVinyl(results, "Jorja Smith", "Lost & Found")).toBe(2);
    expect(countOfficialVinyl(results, "SZA", "Z")).toBe(0);
  });
});
