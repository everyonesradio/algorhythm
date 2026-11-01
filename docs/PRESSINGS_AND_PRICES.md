# Pressings & Prices — scope

Two features built on the Discogs data the scan ingest already collects:

1. **Which pressing is this?** Tell the user which release they're holding
   ("2024 Rhymesayers repress"), not just which album.
2. **What's it worth?** "From $X on Discogs · N for sale", linked to the
   marketplace.

Status: scoped, not built. Both can ship behind `DISCOGS_TOKEN` and degrade
to today's behaviour without it.

## Why they belong together

Prices only mean something per pressing. Measured on 2026-11-01 for MF DOOM
_MM..FOOD_:

| Scope                          | Lowest price | For sale |
| ------------------------------ | ------------ | -------- |
| Master (every version)         | $13.48       | 547      |
| 2004 original (release 356592) | $244.35      | 24       |
| 2024 repress (release 32373327)| —            | 0        |

Showing "$13" to someone holding the 2004 original is wrong by 18×. So
feature 2 shows a **master-level range** by default and only quotes a single
release's price when feature 1 is confident about the pressing.

## What we already have

- `CoverEmbedding` rows with `source: "variant"` and `discogsReleaseId`,
  up to 6 per album, chosen by `pickDiverse` (farthest-first, near-duplicates
  ≥ 0.95 cosine dropped). Written by `addPressingsToAlbum` in the background
  after a scan (`background.ts`, `runInBackground` lane).
- `Album.discogsMasterId`, `discogsReleaseId` (main release), `labels`,
  `styles`, `discogsCheckedAt`.
- The ranking already knows which vector won (`VectorHit.source`). It does
  **not** carry the vector's `discogsReleaseId` yet — one field in the
  `$project` (Atlas) and `select` (local) in `index-search.ts`.

## 1. Pressing identification

### What the image can and can't tell us

CLIP sees the front cover. _MM..FOOD_ has 21 vinyl versions on Discogs; most
reuse the same artwork, so `pickDiverse` keeps only the ones that **look**
different. That gives an honest rule:

- If the winning vector is a `variant` **and** it beats every other vector
  of the same album by a margin, we can say "looks like the 2024 repress".
- If the art is shared across pressings (the common case), the image cannot
  decide. Say so, and let the user pick.

Matrix/runout etching, barcode and label text are what actually identify a
pressing (Discogs has them: `identifiers` on the release, e.g.
`RSE0051-1A`, barcode `826257005113`). Those are phase 1c.

### UX

On the album sheet, under the title:

- **Confident:** `2024 · Rhymesayers · Limited Edition repress` with a small
  "Not this one?" link.
- **Not confident (default):** `21 pressings on Discogs · Which one's yours?`
  opening a list (year, label, country, format notes, thumbnail) — same list
  pattern as the discography picker, max ~10 visible, scroll for more.
- Picking one stores it on the scan and becomes training signal (below).

### Phases

| Phase | Work | Size |
| ----- | ---- | ---- |
| 1a | Carry `discogsReleaseId` through `VectorHit` → ranking → `identify` result. Pressing guess = winning variant when its similarity beats the best non-variant vector of that album by ≥ 0.02. | S |
| 1b | "Which one's yours?" list: `vinyl.pressings({ albumId })` reads `masters/{id}/versions?format=Vinyl` (cached on the album, 30-day refresh, same claim pattern as `claimAlbumForDiscogs`). User pick saved on `ScanEvent.pressingReleaseId`; the scan's own vector stored as `user_scan` with that release id. | M |
| 1c | Barcode: scan the back sleeve barcode in the browser (`BarcodeDetector` where supported, ZXing fallback), look it up via Discogs search `barcode=`. Exact pressing, no ML. | M |
| 1d | Matrix/runout via OCR — research only; runouts are hand-etched and hard to photograph. | — |

1c is the highest-accuracy path and cheaper than it looks; 1a is nearly free
and should ship first.

### Data model

```prisma
model ScanEvent {
  // ...
  pressingReleaseId    Int?   // what the user confirmed
  pressingGuessId      Int?   // what we guessed (for measuring 1a)
}

model Album {
  // ...
  pressings            Json?  // cached vinyl versions: [{ id, year, label, country, notes, thumb }]
  pressingsCheckedAt   DateTime?
}
```

`pressings` is a bounded list (Discogs caps versions per page at 100; we
keep vinyl only), so embedding it on `Album` is fine.

### Measurement

- **Guess precision:** of scans where 1a made a guess, % where the user
  didn't change it. Ship the confident label only if ≥ 90%.
- **Pick rate:** % of album sheets where the user opens and picks a pressing.
  Tells us whether anyone cares before we build 1c.

## 2. Discogs marketplace prices

### Endpoints (verified 2026-11-01)

| Endpoint | Gives | Notes |
| -------- | ----- | ----- |
| `GET /marketplace/stats/{release_id}?curr_abbr=USD` | `lowest_price {value, currency}`, `num_for_sale`, `blocked_from_sale` | 1 request per release. `lowest_price` is `null` when nothing is listed. |
| `GET /masters/{id}` | `lowest_price`, `num_for_sale` across all versions | Already fetched during pressings ingest — free to store. |
| `GET /releases/{id}?curr_abbr=USD` | same two fields + `community.have/want` | Already fetched for the main release. MM..FOOD 2004: have 5201, want 9983. |
| `GET /marketplace/price_suggestions/{id}` | suggested price by condition | **404 for us** — needs a seller account with settings. Out of scope. |

Rate limit: 60 requests/min per token (`x-discogs-ratelimit` header
confirms). Shared with pressings ingest.

### UX

On the album sheet, in the links area:

- Default: `From $13.48 on Discogs · 547 for sale` → links to
  `https://www.discogs.com/sell/list?master_id=8478&format=Vinyl`.
- Pressing known (picked, or confident guess): `This pressing from $244.35 ·
  24 for sale` → `https://www.discogs.com/sell/release/356592`.
- Nothing for sale: `Not for sale right now · 9983 want it` (the want count
  is a nice signal of rarity).
- Show the fetch date when older than a day: "as of 3 days ago".

No price on the scan result itself — the scan stays fast and the price loads
with the sheet.

### Data & caching

```prisma
model Album {
  // ...
  market  Json?   // { lowest: 13.48, currency: "USD", forSale: 547, want: 9983, at: Date }
}
```

- Master-level `market` is written by the existing pressings ingest (the
  `getMaster` call already returns it) — **zero extra requests**.
- Release-level prices are fetched on demand when the sheet opens with a
  known pressing: `vinyl.price({ releaseId })`, cached 24 h in a small
  `MarketPrice` collection keyed by release id (TTL index on `at`).
- Interactive price requests use the **interactive lane** so a running
  ingest can't delay them (same `createLanes` scheduler as MusicBrainz —
  move `dgGet`'s fixed 1050 ms throttle onto it).
- Prices are stale-while-revalidate: show the cached value, refresh in the
  background if older than 24 h.

### Currency

Discogs converts with `curr_abbr` (USD, GBP, EUR, CAD, AUD, JPY, CHF, MXN,
BRL, NZD, SEK, ZAR). Phase 2a: USD only. Phase 2b: pick from
`Accept-Language`/locale, cache per `(release, currency)`.

### Phases

| Phase | Work | Size |
| ----- | ---- | ---- |
| 2a | Store master `lowest_price`/`num_for_sale` + main release `want` during pressings ingest; render the default line + link. USD. | S |
| 2b | Release-level price on demand when the pressing is known; 24 h cache; interactive lane for Discogs. | M |
| 2c | Locale currency. | S |

## Background work & scan latency

Everything here keeps to the rule already in place: **the scan never waits
on Discogs or MusicBrainz.**

- Identify reads only our own vectors. Measured during a full Fleetwood Mac
  pressings + catalog ingest: scan p50 755–765 ms vs 738 ms baseline.
- Pressings and catalog ingest run after the response via `waitUntil`, inside
  `runInBackground`, so their MusicBrainz calls queue behind anything a
  person is waiting on. Before the lanes, the picker's search + discography
  went 2.4 s → 6.0 s during an ingest; with them it stayed within normal
  MusicBrainz variance (5.3 s baseline, 5.7 s / 2.4 s during, on a slow MB
  day).
- New on-demand calls (pressing list, release price) are interactive and
  load into the sheet after the result is on screen.

## Edge cases

- **Album not on Discogs** (`not-found`): hide both features, no empty state.
- **`blocked_from_sale: true`** (some releases are blocked on the
  marketplace): show `Not sold on Discogs`, no link.
- **Multi-disc/box sets** priced as one listing — fine, we show what Discogs
  shows.
- **User-scan vectors** with a confirmed pressing improve 1a for the next
  person, but only store one per `(album, release)` to avoid one user's
  photos dominating.
- **Token missing/ratelimited**: features hide; cached values still shown.

## Open questions

1. **Discogs API Terms of Use.** Marketplace data and images may be shown
   with attribution and a link back; check the current terms for caching
   duration and commercial use before 2a ships (the app already shows
   "Data from Discogs" attribution on the album sheet).
2. **Affiliate/referral.** Discogs has no public affiliate programme for the
   marketplace as far as we know — confirm, since it changes whether the link
   is a revenue line.
3. Is the pressing picker worth it before barcode (1c)? Pick-rate from 1b
   answers this.
4. Collection features ("I own this pressing") — out of scope here, but 1b's
   stored pick is the foundation.

## Recommended order

1a → 2a (both small, no new UI flows) → 1b → 2b → 1c → 2c.
