---
name: git-commit-format
description: Formats git commit messages and groups diffs for RCC/hard-drive-frontend. Use when committing, splitting commits, or when the user asks for commit message format.
---

# Git commit format (RCC frontend)

Apply when staging and committing in **hard-drive-frontend** (and matching RCC repos unless told otherwise).

## Message style

- **One short lowercase sentence** — no `feat:` / `fix:` prefix.
- **Imperative mood** — describe what the commit does: `add`, `fix`, `wire`, `label`, `polish`.
- **`&` not "and"** — `mock orgs & deliverables`.
- **`w/` not "with"** — `new invoice w/ deliverable copy`.
- **No trailing period.**
- **Why over what** when a body is needed (optional second paragraph via HEREDOC); keep the subject line alone for most commits.

### Good examples (from this repo)

```
add pipeline-aligned billing mock seeds
load sample invoices when developer mock mode is on
fix select or create placeholder & polish entity picker
add bill-to select or create on new invoice w/ deliverable copy
label void invoices as cancelled in the UI
```

### Avoid

```
Fix bug.
Updated files
feat: add invoice stuff
Added mock data and also fixed the dialog
```

## Grouping commits

Before committing:

1. Run `git status` and `git diff` (or `git diff --stat`).
2. **One logical change per commit** — split unrelated work (e.g. invoice mock vs select padding vs copy-only label).
3. **Keep related files together** — seed + re-exports + dialog wiring for one feature = one commit when they only make sense as a unit; split when concerns differ (UI vs mock data vs global component).

Typical split:

| Commit | Files |
|--------|--------|
| Mock data / seeds | `lib/mock/*` |
| Page/dialog wiring | `components/**` that consume those mocks |
| Shared UI primitive | `components/ui/*`, `components/shared/*` |
| Config / labels | `lib/config.ts` |

## Workflow

Only commit when the user asks (or an explicit user rule says to).

```bash
git add <paths>
git commit -m "$(cat <<'EOF'
your lowercase subject line

EOF
)"
```

After commit: `git status` to confirm clean or expected remaining changes.

## PR titles (different rule)

PR titles on GitHub use **short Title Case headlines**, not the lowercase commit style.

## HDD backend (if committing there)

Follow `hdd/AGENTS.md`: one short lowercase sentence, `&` / `w/` same as above, branch off `origin/main`, never commit directly to `main`.
