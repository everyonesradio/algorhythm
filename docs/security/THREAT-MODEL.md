# Threat model — algorhythm

The `security-harness` skill reads this file before every security review and audit. Keep it short, factual, and current. Update it in the same PR that changes a boundary, adds an entry surface, or adds an agent tool.

## Product and assets

Consumer vinyl recognition: the browser embeds a camera frame with CLIP (transformers.js in a Web Worker), the server runs Atlas `$vectorSearch` over cover embeddings, and the app routes the matched album to streaming platforms. Public repository, deployed on Vercel, no user accounts.

Assets, in priority order:

1. **Recognition index integrity** — `CoverEmbedding` vectors (catalog + `user_scan`) decide what every visitor's scan matches. Poisoning it mislabels records for everyone.
2. **Shared catalog integrity** — `Album`, `Album.platformLinks`, `LinkIndex`: one shared copy, written by public procedures and background ingest.
3. **Third-party quota on shared server keys** — MusicBrainz (rate-limited per user agent), Discogs token, Spotify client credentials, SendGrid, plus Atlas vector search and Vercel function time.
4. **Waitlist emails** (PII) — `Waitlist`, written by `waitlist.add`, never returned by any procedure.
5. **Server secrets** — `DATABASE_URL`, API keys (`src/env.js`); none are `NEXT_PUBLIC_*`.

## Principals

| Principal                | How identity is established                                                                                       | Normal authority                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Anonymous visitor        | None — every tRPC procedure is `publicProcedure` (`src/server/api/trpc.ts`)                                       | Scan, confirm/pick a match, resolve links, join the waitlist, keep a device library |
| Device (library)         | Client-generated `deviceKey` (`routers/library.ts`), a bearer value, not an identity                              | Add/remove its own library entries                                                  |
| Admin / staff            | No in-app role. Admin work runs as local scripts (`scripts/`, `npm run vinyl:*`, `waitlist:dedupe`) with a DB URL | Full catalog and DB access                                                          |
| Service accounts / CI    | GitHub Actions with `contents: read`, no deploy or cloud secrets (`.github/workflows/`)                           | Read code, run checks                                                               |
| LLM agents / MCP clients | Developer tooling only; no product agent                                                                          | Local repo edits                                                                    |

## Trust boundaries and controls

| Boundary                                | Strongest control                                                                                                                                                              | Where (file)                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Browser → tRPC                          | Zod input schemas: ObjectId/MBID regexes, bounded strings and arrays, vector dims capped at the largest model's size and checked against the chosen model                      | `src/server/api/routers/*.ts`                                                      |
| Scan → shared index (`confirm`, `pick`) | Scan must exist and be within the 30 min action window; `confirm` only accepts an album the scan offered; both cap `user_scan` vectors per album at `MAX_USER_SCANS_PER_ALBUM` | `routers/vinyl.ts`, `services/vinyl/confirm-scan.ts`, `services/vinyl/scan-log.ts` |
| Scan vectors at rest                    | Raw scan vectors dropped after 24 h                                                                                                                                            | `services/vinyl/scan-log.ts`                                                       |
| Library writes                          | `deviceKey` ownership on remove; `ADDS_PER_HOUR` per device on add                                                                                                             | `services/library/library.ts`                                                      |
| Server → third-party fetch (SSRF)       | Host allowlists: `/api/cover` (`i.discogs.com`, `redirect: "error"`); OG cover fetch re-checks every redirect hop against cover hosts, https only                              | `src/pages/api/cover.ts`, `src/server/services/og/cover-data.ts`                   |
| Pasted links → resolvers                | Only known platform URL shapes; exact sources only (official APIs, MusicBrainz)                                                                                                | `services/links/resolve-link.ts`                                                   |
| Server errors → client                  | Internal causes logged server-side; clients get generic messages (`links.search`)                                                                                              | `routers/links.ts`                                                                 |
| Browser hardening                       | HSTS, nosniff, `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy (camera self only), CSP **report-only**                                                            | `next.config.mjs`                                                                  |
| Mongo raw queries                       | Only `$vectorSearch` via `aggregateRaw` with server-built pipeline; user data enters only as a validated number array                                                          | `services/vinyl/index-search.ts`                                                   |

## Entry surfaces

All unauthenticated (`src/server/api/context.ts` composes the routers):

- `vinyl.identify` (mutation) — up to 3 vectors → up to 3 Atlas `$vectorSearch` calls, writes `ScanEvent`, may start background ingest (MusicBrainz/Discogs/Spotify + server CLIP).
- `vinyl.confirm`, `vinyl.pick` (mutations) — write `CoverEmbedding` (`user_scan`); `pick` can create an `Album` for any MusicBrainz release group and starts ingest.
- `vinyl.discography`, `searchArtists`, `album`, `links`, `stats` (queries) — MusicBrainz / platform API calls on shared keys; `links` writes cached links.
- `links.search` (query) — resolves a pasted URL via official APIs; writes `LinkIndex`.
- `library.add/remove/list/stats/facets/details`.
- `waitlist.add` (mutation) — writes `Waitlist`, may send SendGrid email; honeypot field; same response whether or not the email exists.
- REST: `/api/cover` (image proxy), `/api/og/album/[id]` (OG image), `/api/trpc/*`.
- Scheduled/background: `waitUntil` ingest after scans; local scripts only otherwise.

## Approved MCP servers and agent tools

`.cursor/mcp.json` (untracked, local) may point at the public motion.dev docs MCP. No MCP server or agent tool has DB, deploy, or secret access. Agents never run `npm run build` (its `prebuild` runs `prisma db push` against the configured database) or any `vinyl:*` / `waitlist:*` script against a real database.

## Repo-specific attack classes

- **Index poisoning / flooding** — any new path that writes `CoverEmbedding` or `Album` from a public procedure: check it shares the per-album cap, the scan action window, and the candidate check.
- **Quota exhaustion on shared keys** — any public procedure that calls MusicBrainz, Discogs, Spotify, SendGrid, or vector search: check input bounds, caching, and whether one request fans out.
- **SSRF via stored URLs** — `Album.coverUrl` and link fields are written from third-party data; any server fetch of them needs a host allowlist that also holds across redirects.
- **Wrong-but-verified links** — routing must use exact sources; a fuzzy match must never be stored as a verified link (`AGENTS.md` boundaries).
- **Internal detail in errors** — `TRPCError` messages built from `err.message`.

## Running checks locally

Safe, offline: `npm ci`, `npx prisma generate`, `SKIP_ENV_VALIDATION=1 npm run type-check`, `npm run lint`, `npm test -- --run` (routers are tested with `createCaller` and an in-memory Prisma stand-in, `VECTOR_SEARCH_MODE=local`).

Prohibited in audits: `npm run build` (runs `prisma db push`), `npm run dev` against a real `DATABASE_URL`, every `vinyl:*` and `waitlist:*` script, `prisma db push/migrate`, Vercel deploys, and any call that spends MusicBrainz/Discogs/Spotify/SendGrid quota.

## Accepted gaps

| Gap                                                                             | Why accepted for now                                                                                                                                                                                                         | Owner | Revisit                                             |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | --------------------------------------------------- |
| No authentication on any procedure                                              | Product is anonymous by design; integrity relies on input bounds, caps, and the action window                                                                                                                                | TBD   | When accounts ship                                  |
| No rate limiting except `library.add`                                           | Needs edge state; plan is Vercel WAF / edge rate limits on `/api/trpc/vinyl.*`, `/api/trpc/links.*` and `waitlist.add`                                                                                                       | TBD   | Next infra PR                                       |
| `pick` can create an `Album` for any MusicBrainz id                             | Needed for the "unknown album" flow; vector writes are now capped per album, but album creation and ingest are not rate limited                                                                                              | TBD   | With edge rate limits                               |
| `user_scan` cap is count-then-create (not atomic)                               | Concurrent requests can exceed the cap slightly; bounded by request rate                                                                                                                                                     | TBD   | With rate limits                                    |
| CSP is report-only                                                              | transformers.js needs `'wasm-unsafe-eval'`, Hugging Face + jsDelivr hosts and workers; host list is derived from code and unverified in production. No `report-to` endpoint yet, so violations show in browser consoles only | TBD   | After reviewing reports; then enforce in its own PR |
| No SAST job                                                                     | CodeQL is a repository-settings toggle; enable default setup for JS/TS                                                                                                                                                       | TBD   | Next settings pass                                  |
| `npm audit` is report-only                                                      | Existing advisory backlog (high/critical present at the time of writing)                                                                                                                                                     | TBD   | Make blocking once clear                            |
| Full-history gitleaks is report-only                                            | History may hold known items; PR range is blocking                                                                                                                                                                           | TBD   | After a history review                              |
| `puppeteer` is a production dependency but unused in `src/`, `lib/`, `scripts/` | Removal changes the lockfile; separate PR                                                                                                                                                                                    | TBD   | Next dependency PR                                  |
| Waitlist uniqueness                                                             | `Waitlist.email` is already `@unique` in `prisma/schema.prisma`; confirm the index exists in Atlas (owner-observed) before relying on it                                                                                     | TBD   | Next DB check                                       |
| Third-party actions                                                             | Only first-party `actions/*` on major tags; no SHA pinning yet                                                                                                                                                               | TBD   | When adding any third-party action                  |
