import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { coverData } from "../cover-data";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff]);
const CAA = "https://coverartarchive.org/release-group/x/front-500";

/** Behaves like fetch's redirect modes over a fixed map of url -> response. */
const fakeFetch = (routes: Record<string, () => Response>) =>
  vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    let url = String(input);
    for (let hop = 0; hop < 20; hop++) {
      const route = routes[url];
      if (!route) throw new Error(`unexpected fetch ${url}`);
      const res = route();
      const location = res.headers.get("location");
      if (res.status < 300 || res.status >= 400 || !location) return res;
      if (init?.redirect === "manual") return res;
      if (init?.redirect === "error") throw new TypeError("redirect");
      url = new URL(location, url).toString();
    }
    throw new TypeError("too many redirects");
  });

const redirect = (to: string) => () =>
  new Response(null, { status: 307, headers: { location: to } });
const image = () =>
  new Response(JPEG, { headers: { "content-type": "image/jpeg" } });

describe("coverData", () => {
  let fetchMock: ReturnType<typeof fakeFetch>;
  const requested = () => fetchMock.mock.calls.map((c) => String(c[0]));

  beforeEach(() => {
    fetchMock = fakeFetch({
      [CAA]: redirect("https://archive.org/download/x/front.jpg"),
      "https://archive.org/download/x/front.jpg": redirect(
        "https://ia800.us.archive.org/x/front.jpg"
      ),
      "https://ia800.us.archive.org/x/front.jpg": image,
      "https://i.scdn.co/image/off": redirect("https://internal.example/x"),
      "https://internal.example/x": image,
    });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("follows redirects that stay on cover hosts", async () => {
    expect(await coverData(CAA)).toBe(
      `data:image/jpeg;base64,${Buffer.from(JPEG).toString("base64")}`
    );
  });

  it("never requests a redirect target outside the cover hosts", async () => {
    expect(await coverData("https://i.scdn.co/image/off")).toBeNull();
    expect(requested()).not.toContain("https://internal.example/x");
  });

  it("ignores urls outside the cover hosts", async () => {
    expect(await coverData("https://internal.example/x")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
