# AGENTS.md — Algorhythm

**algoRhythm** is a consumer vinyl recognition app: point a camera at a record
cover, detect it, and open the same release across Spotify, Apple Music, YouTube,
Deezer, SoundCloud, and Tidal.

**Tech stack:** Next.js 16 (pages, Turbopack), React 19, TypeScript, tRPC, TanStack React Query, Prisma
(MongoDB), Zod, Tailwind + Motion (`motion/react`), transformers.js (CLIP cover
embeddings) + MongoDB Atlas Vector Search, Vitest, Vercel.

## Agent skills

Engineering skills (Matt Pocock) live under `.agents/skills/` and are linked into
`.cursor/skills/` via `./scripts/sync-cursor-skills.sh`. Product / design / ML
skills are real folders under `.cursor/skills/` and `.claude/skills/`.

### Product bar (default for non-trivial work)

1. **`deepen-task`** — rewrite the ask + external proof
2. **`algorhythm-product-flow`** — pick a track (UX, metric, ML, bug, platform)
3. Playbook trio as needed: **`playbook-build`** / **`playbook-plan`** /
   **`playbook-review`** (always load `references/`)
4. Consumer UI craft: **`design-engineering`**
5. Vinyl model work: **`ml-best-practices`** + **`managing-python-dependencies`**

Overview: `docs/agents/PLAYBOOK-START-HERE.md`

### Engineering (after the ask is clear)

Router: **`/ask-matt`**. Common path: grill → domain-modeling → to-spec →
to-tickets → implement (+ tdd) → code-review → pr.

One-time repo config: **`/setup-matt-pocock-skills`**.

### Issue tracker / domain / triage

See `docs/agents/` (run `/setup-matt-pocock-skills` if these files are still
stubs).

## Commit message style

When creating a git commit, the message is one short sentence:

- **all lowercase** (including the first word)
- **no Conventional Commits prefix** (`feat:`, `fix:`, `chore:`, scopes in parens, etc.)
- **no special characters** except `&` for 'and', `w/` for with
- **why**, not a file list — keep it to one line

```
❌ Fix(releases): Block URL bypass for non-artist workspaces
❌ block releases URLs when the workspace has no artist identity
✅ block releases urls when the workspace has no artist identity
✅ skip all clients picker when roster has one client
✅ remove hide releases flag & show releases only for artist workspaces
```

## PR title style

PR titles are **not** commit messages. They are a short Title Case headline for the change's intent:

- Few words — theme, not the implementation
- Capitalize principal words; keep short prepositions lowercase (`on`, `onto`, `to`, `for`)
- `&` for and, `w/` for with; no Conventional Commits prefix; no trailing period
- Ticket IDs and details go in the PR body

```
❌ return setup progress on skinny and onboarding clients
❌ Return Setup Progress on Skinny & Onboarding Clients
✅ Expose Client Setup Progress

❌ move client setup onto roster w/ progress rings and verified complete
✅ Move Client Setup onto Roster
```

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build (`prisma generate` + `db push` in prebuild) |
| `npm run type-check` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest |
| `npx prisma studio` | Inspect Mongo models |
| `./scripts/seed-local.sh` | Schema + vector index + seed covers (see `docs/VINYL_RECOGNITION.md`) |
| `npm run vinyl:seed` / `vinyl:index` / `vinyl:eval` / `vinyl:synth` | Recognition catalog + accuracy tooling |

## Architecture sketch

```
src/
├── pages/           # Next routes (home waitlist, scan-vinyl, API)
├── components/      # UI (waitlist, vinyl-cover, digital-album, search-card)
├── adapters/        # Platform link builders (Spotify, Apple, YT, …)
├── parsers/         # URL → metadata extractors
├── server/          # tRPC + search/cache/metadata services
├── utils/           # http client, scraper, retry, encoding
└── hooks/
├── lib/embeddings/   # shared CLIP embedder (browser worker + Node seeder)
├── server/services/vinyl/  # vector search + match ranking
└── workers/         # embedding Web Worker
lib/                 # prisma helper
scripts/             # catalog seeding, vector index, accuracy eval
model/               # TFLite notes (now: optional cover *localisation*)
prisma/              # Mongo schema
```

**Domain note:** `Album` is the record identity (MusicBrainz release group,
with Spotify id/url when matched). Cross-platform links are cached in
`Album.platformLinks` by `vinyl.links`; `links.search` resolves any pasted
music URL. (`MusicIDX` was retired; its Mongo collection is left in place.) Recognition and routing are separate
concerns — a bad match must not look verified.

## Boundaries

- Never commit `.env` / secrets
- Prefer existing adapters/parsers over new platform one-offs without a plan
- Camera + ML paths need fail-safe UX (retry / paste link) when detection misses
- Do not invent API shapes the Spotify/Apple/etc. SDKs don't support — `/research` first
