/**
 * Wikidata + Wikipedia for the library's album details.
 *
 * One Wikidata request gives the English Wikipedia article title, the album's
 * IDs on review and reference sites (AllMusic, Metacritic, Rate Your Music,
 * Genius, Discogs) and any review scores recorded with their source. The
 * Wikipedia REST summary gives a plain-text extract and the article URL.
 */
const UA =
  process.env.MUSICBRAINZ_USER_AGENT ??
  "algoRhythm/0.1 ( https://github.com/everyonesradio/algorhythm )";

/** JSON or null, retrying once when rate-limited or the server errors. */
const fetchJson = async <T>(
  url: string
): Promise<{ data: T | null; transient: boolean }> => {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) return { data: (await res.json()) as T, transient: false };
      if (res.status !== 429 && res.status < 500)
        return { data: null, transient: false };
    } catch {
      // network error or timeout: retry once
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
  }
  return { data: null, transient: true };
};

const getJson = async <T>(url: string) => (await fetchJson<T>(url)).data;

type Snak = { datavalue?: { value: unknown } };
type Claim = { mainsnak: Snak; qualifiers?: Record<string, Snak[]> };
type Entity = {
  sitelinks?: { enwiki?: { title: string } };
  claims?: Record<string, Claim[]>;
  labels?: { en?: { value: string } };
};

/** Wikidata external-ID properties → where they link. Only sites we've seen on albums. */
const SITES: { prop: string; name: string; url: (id: string) => string }[] = [
  {
    prop: "P1729",
    name: "AllMusic",
    url: (id) => `https://www.allmusic.com/album/${id}`,
  },
  {
    prop: "P1712",
    name: "Metacritic",
    url: (id) => `https://www.metacritic.com/${id}`,
  },
  {
    prop: "P8392",
    name: "Rate Your Music",
    url: (id) => `https://rateyourmusic.com/release/${id}`,
  },
  {
    prop: "P6217",
    name: "Genius",
    url: (id) => `https://genius.com/albums/${id}`,
  },
  {
    prop: "P1954",
    name: "Discogs",
    url: (id) => `https://www.discogs.com/master/${id}`,
  },
];

export type SiteLink = { name: string; url: string };
export type ReviewScore = { source: string; score: string };

const stringValue = (s?: Snak) =>
  typeof s?.datavalue?.value === "string"
    ? (s.datavalue.value as string)
    : null;

const summary = async (title: string) => {
  const { data: page, transient } = await fetchJson<{
    type?: string;
    extract?: string;
    content_urls?: { desktop?: { page?: string } };
  }>(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`
  );
  // Disambiguation pages aren't about the album.
  if (!page?.extract || page.type === "disambiguation") {
    return { page: null, transient };
  }
  return {
    page: {
      extract: page.extract,
      url:
        page.content_urls?.desktop?.page ??
        `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
    },
    transient: false,
  };
};

export const wikidataInfo = async (qid: string) => {
  if (!/^Q\d+$/.test(qid)) return null;
  const data = await getJson<{ entities: Record<string, Entity> }>(
    `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`
  );
  const entity = data && Object.values(data.entities)[0];
  if (!entity) return null;
  const claims = entity.claims ?? {};

  const links: SiteLink[] = SITES.flatMap(({ prop, name, url }) => {
    const id = stringValue(claims[prop]?.[0]?.mainsnak);
    return id ? [{ name, url: url(id) }] : [];
  });

  // Review scores (P444) with their publication (P447). Kept only when the
  // value carries its scale ("4/5", "9.0/10"): a bare "3.5" is ambiguous.
  const raw = (claims.P444 ?? []).flatMap((c) => {
    const score = stringValue(c.mainsnak);
    const by = c.qualifiers?.P447?.[0]?.datavalue?.value as
      { id?: string } | undefined;
    return score && by?.id && /\/\s*\d/.test(score)
      ? [{ score: score.replace(/\s+/g, ""), by: by.id }]
      : [];
  });
  let scores: ReviewScore[] = [];
  if (raw.length) {
    const ids = [...new Set(raw.map((r) => r.by))].slice(0, 20).join("|");
    const labels = await getJson<{ entities: Record<string, Entity> }>(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids}&props=labels&languages=en&format=json`
    );
    scores = raw.flatMap((r) => {
      const source = labels?.entities[r.by]?.labels?.en?.value;
      return source ? [{ source, score: r.score }] : [];
    });
  }

  const title = entity.sitelinks?.enwiki?.title;
  const wiki = title ? await summary(title) : { page: null, transient: false };
  return {
    wikipedia: wiki.page,
    // Wikipedia was unreachable, not missing: worth asking again soon.
    transient: wiki.transient,
    links,
    scores,
  };
};
