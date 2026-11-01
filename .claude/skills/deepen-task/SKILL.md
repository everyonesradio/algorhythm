---
name: deepen-task
description: >-
  Deepen. Reframes every user task before execution: professional gap, raw
  sources, methods/tools, external proof, rewritten ask. Use at the start of
  every non-trivial request before code, search, or implementation—features,
  fixes, plans, investigations, decisions, refactors. Skip pure continuations
  (yes/go/lgtm), Cursor/Claude meta, or explicit opt-out (skip deepen, just do it).
---

# Deepen task

**Deepen** is the pass before you act. Clarify what the user actually wants, stress edge cases, and rewrite the ask so success is observable—not just "the agent said it's done."

Pair with **`grilling`** when the rewritten task still has unresolved product decisions. Pair with **`context-curiosity-decisions`** once execution starts. Do not replace repo gates (tests, lint, type-check).

## When to run

| Run full deepen | Skip or one-line literal restatement |
|-----------------|--------------------------------------|
| New feature, fix, refactor, investigation, plan, PR, deploy | User continues prior deepen ("yes", "ship that plan") |
| Ambiguous scope or success criteria | Pure Q&A with no deliverable |
| High blast radius (billing, splits, auth, migrations, prod) | User said **skip deepen** or **just do it** |

**Proportionality:** Trivial asks get a **compact deepen** (four lenses in one short paragraph + rewritten ask). Everything else uses the **full template** below.

## Process

1. **Literal ask** — one sentence, no solution yet.
2. **Domain** — name the field (e.g. full-stack product eng, data eng, music publishing ops). Wrong domain wastes the rest.
3. **Four lenses** — mandatory sections; be specific, not generic "write tests."
4. **Assumptions & edge cases** — bullets; flag what you will *not* do unless the user confirms.
5. **Rewritten task** — the plan you will execute if unopposed.
6. **Gate** — after full deepen, **stop and wait** for confirmation unless the user already said to proceed. After compact deepen, you may proceed on low-risk work.

## Four lenses (required)

Use these headings in full deepen output:

### 1. What a top professional would do that you did not ask for

Name concrete practices they would treat as default—not vague virtue. Scope to this domain and this ask.

### 2. Raw material they would start from (not the digest)

List primary sources: code paths, commands, logs, schemas, contracts, tickets, statutes, raw exports, vendor docs, production metrics. Call out what you are currently relying on that is already summarized (this chat, a prior spec, second-hand explanation).

### 3. Methods and tools they would use

Name the actual instruments: profilers, `rg`, OpenAPI, Stripe dashboard, PostHog, pytest, Playwright, BigQuery, interview protocol, etc. Prefer project commands from `AGENTS.md` / `CLAUDE.md` when in-repo.

### 4. What would prove the result is right (besides you or the user)

Name independent validators: CI, regression tests, staging QA, webhook replay, diff against spec, peer review, analytics guardrail, legal/registry check, customer support ticket trend. **Then rewrite the ask/plan/task** so those validators are explicit success criteria—not afterthoughts.

## Output template (full deepen)

```markdown
## Literal ask
…

## Domain
…

## 1. Professional gap
…

## 2. Raw sources
…

## 3. Methods & tools
…

## 4. Proof & rewritten task
**Proof:** …

**Rewritten task:**
- Objective: …
- In scope: …
- Out of scope: …
- Done when: … (each bullet maps to a proof from §4)
- Edge cases: …

**Assumptions** (confirm or correct):
- …
```

## Output template (compact deepen)

One paragraph hitting all four lenses, then **Rewritten task** in 3–5 bullets.

## Execution rules

- Do not start implementation until the rewritten task is accepted (full deepen) or risk is clearly low (compact).
- If deepen reveals the task is backend-first per repo attribution rules, say so **before** frontend work.
- If proof criteria need data you cannot access, say what the user must run or paste.
- After acceptance, execute the **rewritten task**, not the literal ask—unless the user overrides.

## Examples

See [examples.md](examples.md).
