---
name: algorhythm-product-flow
description: >-
  Algorhythm product development flow — consumer vinyl recognition + music-link
  routing. Routes every non-trivial task through deepen, Bartek playbook
  (build/plan/review), Matt Pocock engineering skills, design-engineering, and
  ml-best-practices when the vinyl model is involved. Use at the start of product
  work, UX/copy, feature implementation, and agent-built changes before code —
  default for Algorhythm agent sessions; skip only pure continuations, meta
  tooling questions, or explicit skip deepen / just do it.
---

# Algorhythm product flow

One map for **agent-built product work** on algoRhythm: a consumer vinyl
recognition app that turns a cover into playable links across Spotify, Apple
Music, YouTube, Deezer, SoundCloud, and Tidal.

This skill **routes**. It does not replace the skills it points at.

## The product (keep this in mind)

| Layer | What it is today | Scale direction |
|-------|------------------|-----------------|
| **Recognition** | Camera + COCO-SSD (placeholder) → custom vinyl TFLite model | Labelled cover dataset, EfficientDetLite, on-device inference |
| **Identity** | Spotify as primary MusicIDX source (Prisma/Mongo) | Durable cross-platform IDs, cache hits, verified links |
| **Routing** | MusicBrainz links + barcodes + official APIs → exact album links (no scraping) | Platform coverage, link accuracy |
| **Surface** | Waitlist home + scan-vinyl + digital album / 3D vinyl | First-run magic, permission flow, empty/error craft |
| **Stack** | Next.js 14, tRPC, React Query, Prisma, Zod, Vitest | Deep modules, test seams, typed boundaries |

**Algorhythm is a consumer app.** Lean into Bartek's full play vocabulary
(value-before-ask, Permission Serve, Spark Curiosity, Perceived Effort Delay).
Camera + ML paths need **Fail Safe** and clear fallbacks when recognition misses.

## The standard (what "done" means)

| Pillar | Means here | Primary skills |
|--------|------------|----------------|
| **Linear clarity** | Fast utility paths, obvious next action, no dead UI | `wayfinder`, `to-tickets`, `implement-spec`, `design-engineering` |
| **Shared vocabulary** | Specs you can trust, domain language for cover/link/match | `grill-with-docs`, `domain-modeling`, `to-spec`, GLOSSARY/ADRs |
| **Playbook craft** | Named plays, value-before-ask, no blank moments | `playbook-build`, `playbook-plan`, `playbook-review` |
| **Systems design** | Deep modules, test seams, adapter truth | `codebase-design`, `tdd`, `deepen-task` proof criteria |
| **ML quality** | Dataset → train → evaluate → on-device, not vibes | `ml-best-practices`, `managing-python-dependencies` |
| **Proof** | CI, tests, staging, metrics — not agent approval | `deepen-task` §4, `code-review`, `pr` |

Visual craft for consumer UI goes through **`design-engineering`**. Playbook owns
*moment design*; design-engineering owns *craft bar / library choice*;
**`algorhythm-motion`** + official **`motion`** own *subtle/flowy animation*
(`motion/react`).

## Start every non-trivial task

1. **`deepen-task`** — literal ask, professional gap, raw sources, methods,
   **external proof**, rewritten task. Wait for confirm on full deepen.
2. Pick a **track** below from the rewritten task.

## Tracks (pick one)

### A — Inbound / unclear ask

`deepen-task` → **`/triage`** → **`/implement`** when `ready-for-agent`.

### B — Idea fits one session

`deepen-task` → **`/grill-with-docs`** + **`/domain-modeling`** → **`/to-spec`** → **`/to-tickets`** →

- **`/playbook-build`** on each user-facing ticket *before* or *during* implement
  (scan permission, recognition miss, link results, waitlist, empty/loading/error).
- **`/implement`** or **`/implement-spec`** + **`/tdd`** → **`/code-review`** +
  **`/playbook-review`** on UX in the diff → **`/pr`**.

### C — Foggy / platform-scale

`deepen-task` → **`/wayfinder`** → hand off at **`/to-spec`** (never straight to
implement) → track B.

### D — Metric or goal ("activation stuck", "waitlist → scan")

`deepen-task` → **`/playbook-plan`** (diagnose + play stack + measurement) →
translate into spec/tickets → track B for build.

### E — Existing UX audit

`deepen-task` → **`/playbook-review`** (+ load `moments.md`) →
**`/design-engineering`** + **`/algorhythm-motion`** (and official
**`/motion`**) for polish/animation → fix tickets.

### F — Hard bug

`deepen-task` → **`/diagnosing-bugs`** → **`/retro`**.

### G — Vinyl model / recognition quality

`deepen-task` → **`/ml-best-practices`** (+ **`/managing-python-dependencies`** for
training env) → dataset & evaluation plan before UI polish → track B for app
integration (TFLite load path, fallbacks when model misses).

## Playbook trio (when to invoke)

| Skill | Invoke when |
|-------|-------------|
| **`playbook-plan`** | Goal or metric; roadmap; "what should we build to move X" |
| **`playbook-build`** | Designing/building/writing any **user-facing moment** |
| **`playbook-review`** | "Would you ship this?", critique spec/PR/screen |

Always ship **`references/`** with the skill — load `plays.md` (and
`strategies.md` / `moments.md`) before committing to specifics.

Close build/review outputs with **Plays used**.

## Engineering stack (after UX is specified)

Same as **`/ask-matt`** main flow: context hygiene through `/to-tickets`, fresh
context per **`/implement`**, **`/wizard`** for human-only setup, **`/research`**
for external primary sources (Spotify/Apple APIs, TFLite Model Maker docs).

## High-risk domains (slow down)

- **Camera permission** — ask only when the job needs it; explain why; degrade
  gracefully if denied (`Permission Serve`).
- **Recognition miss** — never leave a blank fail; offer retry, manual search,
  or paste-a-link fallback.
- **Cross-platform match confidence** — unverified links must not look verified;
  prefer Spotify-primary MusicIDX with explicit `isVerified`.
- **Caching / rate limits** — Redis/cache-manager + adapter retries; don't hammer
  platforms.
- **PII** — waitlist emails; no logging secrets from `.env`.

## Skip deepen when

Pure continuations of an already-deepened task, meta tooling ("how do I run
tests?"), or the user says **skip deepen** / **just do it**.
