# Public Library — scope

A public library of the vinyl records crate diggers have actually found and
scanned, worldwide. When someone scans a record, they can add their find to the
library, alongside the streaming links they already get. The library shows every
record people have dug, who dug it (if they want credit) and what they had to
say about it.

Status: the **Add to library** call to action is built (drawer button, note,
undo; `library` router). The library page, album pages and event pages are
next. No accounts, handles or paid features.

Decided on 2026-11-13: the library is open and anonymous (no handles or
profiles until the music-education, "Letterboxd for music" phase in the PRD),
notes are allowed from day one, and there's no separate city field (people
can say where they dug it in the note). It's called the Library.

## Why

- **It makes algoRhythm a community, not a utility.** A scan becomes a
  contribution: "dug by 14 collectors" is a reason to scan that a link isn't.
- **It's where "Stump the Algorithm" lands.** Records taught at pop-ups appear
  in the library with the credit their finder chose. Each pop-up gets a page,
  which doubles as its scoreboard (see the release plan in the system guide).
- **It closes a gap the launch simulation found:** there was no shareable page
  for a scanned record. A library album page is that page.
- **It becomes open data** for Music Tech Hackathon 2027: real records, really
  found, by real people.
- **It's the opposite of the closest competitor.** VinylScan keeps your
  collection private (on the device and in iCloud) behind a paywall. This is
  public, free and shared.

## What we learned from the references

Checked on 2026-11-12 by loading both sites.

### The Playlist Archive (theplaylistarchive.com)

- **Adding is one field:** "Paste a Spotify or Apple Music playlist link to add
  it to the archive", then "Add to Archive". No login, no other fields; the
  curator name comes from the platform.
- **Each entry stores** a title, curator, gradient, cover image (from Spotify),
  the link and the platform (from its public `/api/playlists` endpoint).
- **Browsing is a single grid,** 24 per page, of cards with a tilted cover,
  title and "by {curator}". A running counter on the hero ("0000018 playlists
  shared"). No search, filters or sorting were visible.
- **Clicking a card opens the playlist on the platform**; there is no entry page
  on the archive itself.
- **The 3D covers are CSS 3D transforms, not WebGL:** no `<canvas>` on the page,
  38 elements with 3D transforms. That's why a whole grid of them stays light.
- **It is small:** 18 playlists at the time, two of them from Everyone's Radio.

What to take: the one-step add, the counter, the calm grid of tilted covers done
in CSS. What to add: album pages (so a find has somewhere to live and be
shared), filters, and protection against junk, which a paste-any-link form
doesn't have.

### VinylScan (vinylscan.app)

From its site and the app screenshots shared in the team:

- **Scans the cover or the record label.** "Our advanced AI recognition works
  with both the record label and album artwork." Label scanning is the answer
  to generic company sleeves, which collectors asked for in the simulation.
- **The record page** shows release chips (year, 12", 33 RPM, format, label,
  country, barcode), a market value (low / typical / high, "based on actual
  sold records"), "About this record", an artist story and a Side A / Side B
  tracklist. It claims matrix numbers, condition grading and value history.
- **The collection is private:** stored on the device and in the user's iCloud.
- **Paywall:** unlimited scans and the full collection need Premium. The FAQ
  says "$3.99/week or $29.99/year"; the app's paywall showed $24.99/year.
- **One thing not to copy:** its "About this record" text called the scanned
  copy "the widely released 2022 repress … identified by the standard cover
  art". The original and the repress share that cover art, so the cover can't
  tell them apart. This reads like generated text guessing, presented as fact.

What to take: the tracklist with sides, the release chips, an album and artist
story. What not to take: unsourced generated text, and anything about pressing
or value we can't back up.

## Principles

1. **Only real finds.** A record can be added only from a scan made in the last
   30 minutes (the window the app already enforces for confirming a scan).
   Every entry is a record someone held. This is also the main anti-spam
   measure, without needing accounts.
2. **No user photos.** The library shows catalog or pressing artwork (Cover Art
   Archive, Spotify, the Discogs pressing that matched), never the user's photo.
   The app only ever receives a vector from the phone, so there's nothing to
   moderate in images.
3. **Open and anonymous.** No accounts, handles or profiles yet: a find is the
   record, the date and an optional note. Profiles come with the
   music-education phase ("Letterboxd for music"). No location field; diggers
   don't have to reveal their sources.
4. **Facts are sourced.** Tracklists from MusicBrainz, stories from Wikipedia
   with attribution and a link. No generated "about" text. Pressing claims only
   when we know the pressing (a Discogs variant matched, or later the barcode
   or label).
5. **Open by default.** Library data (album, pressing art, date, event) is
   part of the open dataset. Notes are shown publicly on the site; whether
   they go into the dataset export is decided before the first export.

## Phase 1 — ready for the first pop-up (no accounts)

### Flows

**Add a find (from the result drawer)**
1. After a scan, the drawer shows **Add to library** next to the links.
2. A small form opens with one optional field: a **note**, up to 140
   characters ("£3 bin at a Saturday car boot"), marked "Shown publicly, no
   name attached".
3. Tap **Add**. The drawer shows "In the library · first find" (or "dug 15
   times"), with **Undo**. Adding also answers "Right record?" with yes. The
   same scan can be added once; a second tap returns the same find.

Picking an unknown record by hand (the artist picker) counts as a scan, so
taught records can be added too. At a pop-up, an event tag is attached
automatically (set on the scanning device by George for the evening).

**Browse the library (`/library`)**
- A counter: records dug, collectors, cities.
- A grid of tilted covers (CSS 3D, like The Playlist Archive): cover, title,
  artist, "dug N times", and the latest note.
- Sort: **Recent** (default) or **Most dug**.
- Filter: genre, decade, event (pop-up).
- 24 per page with "Load more".

**Album page (`/library/{album}`), shareable**
- The cover in 3D (three.js, the existing `Vinyl3D`), showing the pressing art
  most finds matched.
- Release chips: year, label, country, and the format from the pressing when
  known.
- Streaming links (existing, exact).
- **Tracklist** from MusicBrainz, split into sides when the pressing is known
  (from Discogs).
- **About the album** and **About the artist**: Wikipedia summaries, each with
  "From Wikipedia" and a link. Hidden when there isn't one.
- **Finds:** "Dug 14 times", with recent finds (note, date, event).
- Open Graph image: the cover plus "dug by N", so links to it look good in
  group chats and on social.

**Event page (`/library/event/{slug}`)**
- Every find added at one pop-up, in the order they happened, with the
  Stump scoreboard (tried / named / stumped / taught) once that exists.

**Taking a find down**
- The device that added a find can remove it (a device key, below).
- A **Report** link on each find. George can hide a find or a note.

### Data model

```prisma
model LibraryEntry {
  id            String   @id @default(auto()) @map("_id") @db.ObjectId
  albumId       String   @db.ObjectId
  album         Album    @relation(fields: [albumId], references: [id], onDelete: Cascade)
  scanId        String   @unique @db.ObjectId // one find per scan
  coverUrl      String?  // the art that matched (pressing / Spotify), only art we already hold
  deviceKeyHash String   // lets the same device remove it
  note          String?  // up to 140 characters
  event         String?  // pop-up slug, later
  hidden        Boolean  @default(false) // moderation
  createdAt     DateTime @default(now())

  @@index([albumId, createdAt])
  @@index([createdAt])
  @@index([deviceKeyHash, createdAt])
}
```

On `Album`, cached (no new collection):
- `libraryCount Int?`, kept in step with entries, for "dug by N" and
  "Most dug".
- `extra.tracklist`: tracks from MusicBrainz. Side positions are stored per
  pressing (keyed by Discogs release id) when known.
- `extra.about`: `{ album?: { text, url }, artist?: { text, url }, fetchedAt }`
  from Wikipedia.

**Device key.** On first add, the browser creates a random key and keeps it in
`localStorage`. The server stores only its hash. It's what lets "remove my
find" work without accounts. It can be cleared by the browser; Phase 2 accounts
fix that.

### API (tRPC)

| Procedure | Does |
|---|---|
| `library.add({ scanId, albumId, deviceKey, note?, coverUrl? })` | **Built.** Checks the scan is fresh and identified this album, confirms it if needed, stores the entry, recounts `libraryCount`. Idempotent per scan; 30 adds per device per hour |
| `library.status({ albumId, scanId?, deviceKey? })` | **Built.** "Dug N times", and whether this scan's find is in (and is this phone's) |
| `library.remove({ entryId, deviceKey })` | **Built.** Undo, from the phone that added it |
| `library.list({ sort, genre?, decade?, event?, cursor })` | The grid, 24 at a time |
| `library.album({ albumId })` | Album page: album, links, tracklist, about, recent finds |
| `library.event({ slug })` | Event page |
| `library.report({ entryId, reason })` | Flags a find for review |
| `library.stats()` | The counter |

Rate limits on `add` and `report` per IP and per device key.

### Where the album information comes from

| Field | Source | When fetched |
|---|---|---|
| Tracklist | MusicBrainz release with `inc=recordings+media` (prefer an official vinyl release) | First album-page view, then cached; prefetched during ingest |
| Sides (A1, B1…) | The matched Discogs pressing's tracklist, when the pressing is known | Same |
| About the album | Wikipedia summary, reached through the release group's Wikidata link in MusicBrainz | Same; cached 30 days |
| About the artist | Wikipedia summary via the artist's Wikidata link | Same |
| Pressing format, country | Discogs pressing that matched, when known | Already stored with variant vectors |

Verified on 2026-11-12 with Frank Ocean's *Blonde*:
- **MusicBrainz → Wikidata → Wikipedia works.** The release group links
  Wikidata `Q26450992`; its English Wikipedia sitelink is "Blonde (Frank Ocean
  album)"; the REST summary returns a clean extract and page URL. Three
  requests, cached after the first view. Wikipedia text is CC BY-SA: show
  "From Wikipedia" with a link, and keep it unedited.
- **MusicBrainz tracklists don't reliably carry sides.** *Blonde*'s 2022 US
  12" vinyl is one medium numbered 1–17. Sides appear only where editors
  entered A1-style positions. The Discogs master is also numbered 1–17.
- **Discogs vinyl releases do carry sides, and they differ by pressing.** One
  2016 LP on Discogs runs A1–A5 then B1 "Skyline To"; the VinylScan
  screenshot showed seven tracks on side A. So sides come only from the
  pressing that matched. Without a known pressing, show one continuous
  tracklist rather than invent a side split.

### Performance

- **Grid:** CSS 3D transforms only. No WebGL in the grid: dozens of three.js
  canvases would overwhelm a phone.
- **Images:** the 500 px Cover Art Archive or 640 px Spotify art, lazy-loaded,
  with the Discogs proxy (`/api/cover`) only where needed.
- **Album page:** one three.js canvas, as in the drawer today. Tracklist and
  about are cached on the album, so a repeat view is a database read.
- **Counts:** `libraryCount` on the album, so "Most dug" is one indexed sort.

### Safety and privacy

- No accounts, handles, emails or user photos in Phase 1.
- No location field.
- Notes: 140 characters, plain text, rate-limited, reportable, hideable.
- Removal by the device that added it; anything else by request.

### Measuring it

- Share of identified scans that become finds (target to learn, not to hit).
- Finds per collector; repeat collectors.
- Album-page views from outside the app (shared links).
- Finds per pop-up (feeds the Stump scoreboard).
- Reports per 100 finds (moderation load).

### Out of scope for Phase 1

Accounts, personal crate pages, following, maps, prices or value, condition,
export, comments beyond the note, and label or matrix scanning.

## Phase 2 — profiles, with the music-education phase ("Letterboxd for music")

- **Accounts by email link,** with a profile, so a digger's finds carry across devices.
- **Crate pages** at `/@handle`: everything a digger has found.
- **Following** diggers whose finds you like.
- **A coarse map** of where records are being dug (city level, opt-in only).
- **Export** a crate (CSV; later Rekordbox, for DJs).
- **Label scanning** for generic company sleeves (as VinylScan does), feeding
  pressing identification (see `PRESSINGS_AND_PRICES.md`).

## Decisions

1. **Name:** the Library. ✔
2. **Credit:** none yet. Open and anonymous until profiles arrive with the
   music-education phase. ✔
3. **Notes:** allowed from day one. ✔
4. **Stump records:** should records taught at pop-ups enter the library
   automatically, or only when someone taps Add? (Open.)

## Build plan (Phase 1)

| Step | Work | Size |
|---|---|---|
| 1 | `LibraryEntry` model, `libraryCount`, `library.add/status/remove` with scan checks and rate limit | M · **done** |
| 2 | "Add to library" in the drawer: optional note, undo, device key | M · **done** |
| 3 | `/library` grid with CSS 3D covers, sort, filters, counter | M |
| 4 | Album page: tracklist and about fetching + caching, finds list, OG image | L |
| 5 | Event tag + event page | S |
| 6 | Moderation: hide flag, report review script (`vinyl:library --reported`) | S |
| 7 | Tests, docs, the open-dataset export including finds | S |
