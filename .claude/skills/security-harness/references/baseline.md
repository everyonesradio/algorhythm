# Repo hardening baseline (harden mode)

The minimum every repo carries. Run through it top to bottom; each item is either present, added in this PR, or recorded in the local `.security/THREAT-MODEL.md` under "Accepted gaps" with a reason and owner. Done when every row has one of those three outcomes.

## Policy and ownership

- [ ] `SECURITY.md` — how to report privately (GitHub private vulnerability reporting / security advisories, or a security email), what's in scope, response targets, and "do not open public issues for vulnerabilities".
- [ ] `.security/THREAT-MODEL.md` (local only) — the recon seed this skill reads: assets, principals, trust boundaries + controls, entry surfaces, approved MCP servers, prohibited commands, offline test commands, repo-specific attack classes, accepted gaps. `.security/` is in `.gitignore`; the file never reaches GitHub.

## CI and supply chain

- [ ] A `security` workflow on `pull_request` + weekly schedule with top-level `permissions: contents: read`:
  - secret scanning (gitleaks) over the PR range;
  - dependency audit (`pip-audit` / `npm audit` / `pnpm audit`) at `high`+, non-blocking until the backlog is clear, then blocking;
  - a SAST pass suited to the stack (bandit or semgrep for Python; CodeQL or semgrep for TS) — report-only to start.
  - "Report-only" means `continue-on-error: true` on the scanner **step**, not the job: a job-level flag still shows a red check on the PR.
- [ ] `.github/dependabot.yml` for the package ecosystem(s), `github-actions`, and `docker` where used; weekly, grouped minor/patch.
- [ ] Every workflow has an explicit `permissions:` block; third-party actions pinned to a commit SHA; untrusted `${{ github.event.* }}` / `inputs.*` values passed via `env:`, never interpolated into `run:`; no `pull_request_target` checking out PR code.
- [ ] Long-lived cloud keys in CI are a tracked gap until replaced by OIDC / Workload Identity Federation.

## Secrets and data in the repo

- [ ] `.gitignore` covers `.security/` (threat model and other private security notes), `.env*` (allow `.env.example`), key files (`*.pem`, `*-sa.json`), local agent settings (`.claude/settings.local.json`), and data exports.
- [ ] No customer data, exports, or credentials tracked (`git ls-files` for `*.csv`, `*.json` dumps, `.env`). Removing a file doesn't remove history — tell the owner so they can decide on rotation/purge.
- [ ] Client bundles expose only intentionally public config (`NEXT_PUBLIC_*`, `VITE_*`).

## App surface

- [ ] Security headers at the edge or framework: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `frame-ancestors 'none'` (or `X-Frame-Options: DENY`), a `Permissions-Policy` that grants only what the app uses. CSP ships as `Content-Security-Policy-Report-Only` first, then enforced once reports are clean.
- [ ] Framework production settings: debug off, secure cookies, trusted proxy headers, CORS allowlist (never `*` with credentials).
- [ ] Authentication is default-deny: new routes/pages are protected unless explicitly listed public — enforced by middleware or a test that fails when a route lacks a guard.
- [ ] Every unauthenticated write and every expensive call (LLM, vector search, email/SMS, third-party APIs on a shared key) has input bounds and a rate limit or quota.
- [ ] Errors returned to clients carry no stack traces or internal messages.

## Agents

- [ ] The agent policy in [ai-agents.md](ai-agents.md) holds for every product agent and MCP server.
- [ ] Committed agent config is portable and least-privilege; machine-local settings are untracked.

## Shipping a hardening PR

Bundle low-risk items (policy files, CI, dependabot, headers in report-only, gitignore, small fixes with regression tests) into one PR. Split anything that can change prod behavior — enforcing CSP, flipping debug/secure settings, tightening service auth, blocking scanners — into its own PR with a rollout note. List deferred items in the PR body at the level of "what control is missing", never as an exploit recipe; the detail lives in the local threat model.
