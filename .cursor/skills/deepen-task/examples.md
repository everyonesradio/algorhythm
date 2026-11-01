# Deepen task — examples

## Example A — full deepen (hub-frontend bug)

**User:** "The billing header shows the wrong trial days left."

### Literal ask
Fix incorrect trial-days copy in the workspace billing header.

### Domain
Full-stack SaaS billing (Stripe subscription state → API → React UI).

### 1. Professional gap
- Trace entitlement copy to a single source of truth in hub-api, not a frontend guess.
- Add or extend a regression test on the copy helper and a component test for the header meta.
- Verify trialing vs past_due vs canceled, timezone boundaries, and missing `trial_end`.
- Check staging with a real test-mode subscription, not only mocked JSON.

### 2. Raw sources
- `WorkspaceBillingHeaderMeta.tsx`, billing/team React Query hooks, generated client types for `/self/teams`.
- hub-api: entitlement copy util, Stripe webhook handlers, team subscription columns.
- Stripe test customer with known `trial_end`; local webhook log from `./scripts/dev-stripe-webhook.sh`.

### 3. Methods & tools
- `rg` for trial/copy strings; read OpenAPI or regenerate client if fields missing.
- hub-api: `pytest` on `entitlement_copy` (or equivalent); docker compose exec pattern from `AGENTS.md`.
- hub-frontend: `npm run test:run` on focused test file; manual check at `?settings=billing`.

### 4. Proof & rewritten task
**Proof:** pytest passes on copy edge cases; Vitest fails without fix and passes with it; manual staging header matches Stripe dashboard trial end for same customer.

**Rewritten task:**
- **Objective:** Show correct trial days remaining for trialing teams everywhere the workspace billing header meta appears.
- **In scope:** Backend copy calculation if wrong; frontend only displays API fields; regression tests both sides.
- **Out of scope:** Pricing table redesign, unrelated settings tabs.
- **Done when:** Tests cover at least (a) 0 days left, (b) partial day rounding policy, (c) non-trialing states show non-trial copy; CI green; staging spot-check documented in PR test plan.
- **Edge cases:** null `trial_end`, clock skew, team without Stripe customer, assume-stripe-entitled local dev flag.

---

## Example B — compact deepen

**User:** "Rename this variable to `clientNumber` in this file only."

**Compact:** Professional would grep for shadowing and public API exports; raw source is the single file plus TypeScript references; method is `tsc --noEmit` and eslint on that file; proof is type-check + lint clean with no new importers broken. **Rewritten task:** Rename identifier in the given file, update intra-file references, run type-check and lint on touched path, do not chase cross-repo renames.
