# CLAUDE.md — Algorhythm

Consumer vinyl recognition + multi-platform music link app (Everyone's Radio).

See **`AGENTS.md`** for commands, architecture, and the skill map. This file is
the Claude Code entry point.

## Agent skills

- Product router: **`.claude/skills/algorhythm-product-flow/SKILL.md`**
- Playbook: `playbook-build` / `playbook-plan` / `playbook-review` (with
  `references/`)
- Engineering: vendored under `.agents/skills/` (also linked from
  `.claude/skills/`). Router: **`/ask-matt`**
- First-time config: **`/setup-matt-pocock-skills`**

Non-trivial work → **`deepen-task`**, then the product flow. Skip only for
continuations, meta, or explicit **skip deepen** / **just do it**.

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

## Stack reminders

- Next.js **pages** router (not App Router)
- API surface is **tRPC** (`src/server/api/`)
- Data: **Prisma + MongoDB** (`Waitlist`, `Album`, `CoverEmbedding`,
  `ScanEvent`)
- Recognition: **image retrieval**, not classification. CLIP embeds the cover
  in the browser (transformers.js Web Worker); MongoDB Atlas `$vectorSearch`
  finds the nearest catalog cover. See `docs/VINYL_RECOGNITION.md`.
