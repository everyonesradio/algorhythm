# Recon (audit mode, stage 1)

Goal: a shared map every hunter receives verbatim, plus a coverage plan the harness can count. Recon reads source only; it never runs target code or contacts a service.

## 1. Start the run

```bash
node <skill-dir>/scripts/harness.mjs init --repo . --profile standard
```

`init` records the commit, dirty flag, and a run id. State lives outside the repo (`~/.security-harness/<repo>/` by default, override with `--dir`). Prior runs in the same dir are read automatically: their open units, `needs_validation` findings, and wishlist items become this run's first work.

Profiles: `quick` (one hunter wave, coarse units, one validator per candidate), `standard`, `deep` (split units per subsystem and lifecycle, gapfill until a clean pass). Profiles change breadth, never the evidence bar.

## 2. Three parallel recon agents

Each returns facts with repo-relative `file:line` refs and writes nothing.

**Recon A — product and operation.** What the product does, who its users and operators are, the stack, entry points per subsystem, how to build and run tests offline, and which commands would hit the network, publish, deploy, or touch shared state (mark those prohibited).

**Recon B — principals and controls.** Every principal (anonymous visitor, signed-in user, org member/admin, staff/superuser, service account, CI job, LLM agent, MCP client, webhook sender). For each: how identity is established, where per-resource authorization happens, the helper the codebase uses for ownership checks, and which controls live outside the repo (Cloud Run IAM, Firebase rules, Vercel/Firebase headers, Doppler, Atlas network access).

**Recon C — surfaces and sinks.** Every place lower-trust input enters (HTTP routes, tRPC procedures, server actions, webhooks, file uploads/imports, email/PDF ingestion, scheduled jobs reading external data, LLM tool calls, MCP tools, CLI/management commands exposed through CI) and the sinks each reaches. Note parallel paths to the same effect (UI route vs API vs bulk import vs admin action).

## 3. Synthesize `architecture.md`

Update `docs/security/THREAT-MODEL.md` in the repo when it is wrong or missing something; copy its current text into the run as `architecture.md` (cap ~1,000 words): product and assets, principals, trust boundaries with the strongest control on each, entry surfaces, prohibited commands, offline test commands, and **repo-specific attack classes** — invent them when the domain needs one (e.g. "split-percentage tampering", "royalty statement parser abuse", "waitlist enumeration"), each with a one-line method.

## 4. Seed coverage units

One unit per material (surface × boundary × attack class). Write them as a JSON array and import:

```bash
node <skill-dir>/scripts/harness.mjs unit import units.json
```

```json
[{"surface": "POST /api/deals/{deal_number}", "boundary": "org ownership via get_object_for_user", "subsystem": "deals", "attack_class": "access-control", "paths": ["api/routers/deals.py"], "priority": 1}]
```

Priority 1 = unauthenticated or lowest-trust surface, or the most valuable asset (credentials, cross-tenant data, money, code execution, release authority). Unit ids are derived from the four refs, so the same surface keeps its id across runs.

Recon is done when every surface from Recon C belongs to at least one unit, and `harness.mjs status` shows the units as `planned`.
