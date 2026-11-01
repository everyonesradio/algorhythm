# AGENTS.md — Algorhythm

**algoRhythm** is a consumer vinyl recognition app: point a camera at a record
cover, detect it, and open the same release across Spotify, Apple Music, YouTube,
Deezer, SoundCloud, and Tidal.

**Tech stack:** Next.js 14 (pages), TypeScript, tRPC, TanStack React Query, Prisma
(MongoDB), Zod, Tailwind + MUI + styled-components, TensorFlow.js / COCO-SSD
(custom TFLite vinyl model planned), Vitest, Vercel.

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

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build (`prisma generate` + `db push` in prebuild) |
| `npm run type-check` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest |
| `npx prisma studio` | Inspect Mongo models (`Waitlist`, `MusicIDX`) |

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
lib/                 # prisma + spotify SDK helpers
model/               # TFLite Model Maker notes for vinyl detector
prisma/              # Mongo schema
```

**Domain note:** Spotify is the primary identity for `MusicIDX`. Cross-platform
links live in `platformLinks` JSON. Recognition and routing are separate
concerns — a bad match must not look verified.

## Boundaries

- Never commit `.env` / secrets
- Prefer existing adapters/parsers over new platform one-offs without a plan
- Camera + ML paths need fail-safe UX (retry / paste link) when detection misses
- Do not invent API shapes the Spotify/Apple/etc. SDKs don't support — `/research` first
