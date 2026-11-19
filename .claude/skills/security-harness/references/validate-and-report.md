# Validate, judge, fix, report (audit stages 3–6, and triage mode)

## 3. Validate — a fresh agent tries to disprove each candidate

Two passes, in this order:

1. **Deterministic** (no model): `harness.mjs submit` / `finding add` already rejected candidates whose schema is wrong, whose cited files or lines don't exist, or whose threat model is incomplete. Run `harness.mjs check` before validating to re-verify against the current tree.
2. **Adversarial validator**: one fresh agent per candidate, different prompt and ideally a different model from the hunter. It cannot file new findings.

Validator prompt (verbatim):

```text
You did not write this candidate. Your job is to DISPROVE it using repository source and bounded
local evidence. Work locally with dummy data and no network.

1. Re-read every cited file and line. Confirm the entry point is reachable by the stated attacker
   and the sink does what the candidate claims.
2. Reconstruct the strongest control on the path: authentication, ownership/tenant checks,
   validation, framework defaults, middleware, database constraints. If any of them stops the
   attack, reject and cite it.
3. Run the PoC against UNMODIFIED source. It must fail (demonstrate the bug) before the patch and
   pass after. A PoC that edits application code, mocks away the control under test, or asserts a
   tautology is invalid.
4. Answer separately: (a) is the code wrong? (b) can an outside attacker reach it, and as which
   principal? Classify reachability: internet_unauthenticated | internet_authenticated |
   internal | latent.
5. Check severity against demonstrated impact only.

Return exactly one JSON object:
{"fingerprint": "...", "verdict": "confirmed|needs_validation|rejected", "reachability": "...",
 "severity": "critical|high|medium|low|info|null", "reason": "...", "blockers": ["..."]}
```

Record it (the harness refuses a validator that hunted the same finding):

```bash
node <skill-dir>/scripts/harness.mjs verdict <fingerprint> --agent validator-03 --verdict confirmed --reachability internet_authenticated --severity high --reason "..."
```

Verdicts: **confirmed** = trace + PoC red on untouched code + patch; **needs_validation** = source-grounded, blocked on one named fact (with a safe owner-observed check), no severity; **rejected** = disproved, kept so later runs don't re-file it unchanged.

## 4. Dedup

Same root cause = one finding, even across many endpoints; one fix should close the cluster. Fingerprints are source-derived (`<attack_class>:<path>:<symbol>`), never line numbers, so they survive edits. When two fingerprints share a fix, `harness.mjs merge <keep> <drop>`.

## 5. Judge and fix

For each confirmed finding, a judgment pass decides priority: internet-reachable and unauthenticated first, then authenticated cross-tenant, then internal, then latent. It also checks the bug still exists on the default branch and names the owner (git blame / the team that owns the area).

The fixer rewrites the patch to repo style, adds the PoC as a regression test, and runs the relevant suite before and after. Required: a clean red → green flip and no new failures. A failing post-patch suite or downstream regression blocks the branch and goes to a human. The fixer opens a PR; it never merges or deploys. One root cause per PR so review stays small; critical/high get fast-tracked.

## 6. Report

```bash
node <skill-dir>/scripts/harness.mjs report > REPORT.md
```

Rendered from state by a script, no model: run metadata, coverage (covered / shallow / deferred units and gapfill cells), a confirmed table sorted by priority, needs-validation leads with blockers, wishlist, and hardening notes. Keep prose consistent with the JSON — the JSON wins.

Where results go:
- Confirmed, unfixed findings → private: a GitHub Security Advisory draft or a restricted Linear ticket. Never a public issue, PR title, or commit message that describes an exploitable unfixed bug in a public repo.
- Fix PRs describe the invariant enforced ("deal endpoints now scope by organization"), not a step-by-step exploit.
- Harness state stays outside the repo and the threat model stays in gitignored `.security/`; commit only fixes and regression tests.

## Triage mode

For an external report or scanner alert: write the threat-model line, run the validator prompt above yourself (you are the fresh agent), and reply with verdict, reachability, severity, and either the PoC + fix plan or the exact blocker. Scanner output (Dependabot, npm/pip audit, CodeQL) is a candidate, not a finding: confirm the vulnerable code path is reachable in this repo before prioritizing it.
