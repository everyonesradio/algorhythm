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

## Stack reminders

- Next.js **pages** router (not App Router)
- API surface is **tRPC** (`src/server/api/`)
- Data: **Prisma + MongoDB** (`Waitlist`, `MusicIDX`)
- Recognition: TensorFlow.js today; custom TFLite vinyl model is the scale path
  (`model/model_overview.py`, `ml-best-practices`)
