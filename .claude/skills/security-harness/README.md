# security-harness

One security skill, shared by every repo (Patchbay, Project Hard Drive, Algorhythm). It sets the security policy agents follow and gives them a vulnerability harness for audits. The skill is identical in every repo. What makes it repo-specific is `docs/security/THREAT-MODEL.md`, which each repo keeps current.

## What it does

| Mode | Use it for |
|---|---|
| review | A checklist for diffs and PRs (authn, ownership/IDOR, input bounds, sinks, secrets, abuse, AI) |
| audit | A full harness run: recon → narrow hunters → adversarial validators → gapfill → report rendered by a script |
| triage | Scanner alerts and external reports. Each one becomes a validated verdict with reachability and severity |
| harden | The baseline every repo should meet: SECURITY.md, threat model, CODEOWNERS, security CI, dependabot, headers, agent config |

The AI and agent policy (`references/ai-agents.md`) applies whenever a model, tool, or MCP server touches untrusted input.

## Layout

```
SKILL.md                         router + rules for every mode (always read)
references/recon.md              audit stage 1
references/hunt.md               hunter prompt, attack classes, gapfill
references/validate-and-report.md  validator prompt, dedup, judge/fix, report, triage
references/stacks.md             FastAPI/Django, Next.js, tRPC+Prisma+Mongo, Vite+Firebase, GitHub Actions, Cloud Run
references/ai-agents.md          LLM/agent hunt classes + agent policy
references/baseline.md           harden-mode checklist
schema/finding.schema.json       finding record (documentation; the CLI enforces it)
scripts/harness.mjs              zero-dependency state CLI (Node >= 18)
scripts/selftest.mjs         node --test scripts/selftest.mjs
templates/                       THREAT-MODEL.md and SECURITY.md starters for a new repo
```

## Adding it to a new repo

1. Copy this folder to `.claude/skills/security-harness/`. In repos that mirror skills for Cursor, run `./scripts/sync-cursor-skills.sh` or symlink `.cursor/skills/security-harness`.
2. Copy `templates/SECURITY.md` to the repo root and `templates/THREAT-MODEL.md` to `docs/security/`, then fill them in. Recon mode can draft the threat model for you.
3. Work through `references/baseline.md` and open a hardening PR.
4. Add one line to `AGENTS.md`/`CLAUDE.md` pointing at the skill. That line is what triggers it.

Keep the copies in sync. When you change the skill in one repo, port the change to the others in the same week. Keep repo-specific facts in `THREAT-MODEL.md`, never in the skill.

## Why it's shaped this way

This skill adapts Cloudflare's published approach to fit our stacks and team size:

- [Build your own vulnerability harness](https://blog.cloudflare.com/build-your-own-vulnerability-harness). The stages it adapts are recon → hunt → validate → gapfill → dedup → trace → feedback → report. The rules it takes from the post:
  - Write the threat model before the finding.
  - The PoC must run against untouched code.
  - The validator is never the hunter and cannot file findings.
  - State lives outside the model.
  - A hunter that finds nothing gets flagged as shallow.
  - A wishlist records missing resources.
  - Humans merge every fix.
- [cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill) (MIT). This is the single-repo skill the harness grew from. The verdicts `confirmed` / `needs_validation` / `rejected`, the severity anchors, and the hunter and validator prompts are adapted from it. Its deeper companion files are worth installing for a `deep` audit with `npx skills add https://github.com/cloudflare/security-audit-skill --skill security-audit`.
- [Project Glasswing: what Mythos showed us](https://blog.cloudflare.com/cyber-frontier-models/). The lessons it supplies:
  - Narrow scope beats open-ended prompts.
  - "Is it buggy?" and "is it reachable?" are separate questions.
  - Many parallel narrow tasks beat one long session.
  - Model-written patches can break dependents, so a regression test is required.
- [Securing and governing AI agents](https://www.cloudflare.com/the-net/building-cyber-resilience/secure-govern-ai-agents/) and [defending against frontier-model attackers](https://blog.cloudflare.com/frontier-model-defense/). The agent policy draws on both:
  - Least privilege for every tool.
  - Only approved MCP servers.
  - Log every agent action.
  - Put a human gate on irreversible actions.
  - Set budgets.
  - Assume the attacker has a frontier model too, so limit the blast radius and close reachability early.
