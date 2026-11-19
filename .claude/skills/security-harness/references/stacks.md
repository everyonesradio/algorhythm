# Stack-specific hunt hints

Read only the sections for stacks this repo uses. Each item is where a bug tends to hide, not a finding by itself.

## FastAPI / Django (Python backends)

- **Post-hoc authorization**: a decorator or response-model `check_permissions` that runs *after* the command executed means a failing check still left the write behind. The resource check must run before any side effect.
- **Service and system principals**: static API keys, impersonation headers (`X-Acting-As-User`), and Google/OIDC service tokens. Verify audience/`azp`/email binding on every token type, constant-time comparison for shared secrets, and that impersonation is limited to the callers that need it.
- **Client IP**: rate limits keyed on the *first* `X-Forwarded-For` entry are client-controlled; behind Cloud Run/a load balancer use the hop the trusted proxy appended.

- **Ownership**: find the project's object-access helper (e.g. `get_object_for_user`, a queryset filtered by `organization`/`membership`). Grep handlers for `.objects.get(`, `get_object_or_404(`, `filter(<x>_number=` that are not scoped by the caller's org/user. UUID "numbers" are unguessable-ish but leak through lists, emails, URLs, and logs — they are not authorization.
- **Mass assignment**: Pydantic/Ninja schemas or serializers that accept `owner`, `organization_id`, `role`, `is_staff`, `status`, money fields; `**payload.dict()` into `objects.create/update`.
- **Staff/admin paths**: `is_staff`/`is_superuser`/"system user" checks that are skipped on alternate routers, management commands exposed through CI `workflow_dispatch`, admin MCP servers.
- **Raw SQL**: `raw(`, `extra(`, `RawSQL(`, `cursor.execute(` with f-strings.
- **Settings**: `DEBUG`, `ALLOWED_HOSTS`, `CORS_ALLOW_ALL_ORIGINS`/credentials, `CSRF_TRUSTED_ORIGINS`, `SECURE_*`, `SESSION_COOKIE_SECURE`, default `SECRET_KEY` fallback in code.
- **Files**: `FileField` names from user input, `default_storage.save(user_name)`, signed URL expiry, `Content-Disposition`.
- **Fetchers**: `requests.get(url)` / `httpx` with user or document-supplied URLs (PDF/image import, unfurl, webhooks) — check scheme, host allowlist, `allow_redirects`, private IP ranges, timeouts, max size.
- **Async jobs**: Celery/Cloud Run job payloads trust IDs without re-checking the requesting user.
- **Tests**: pytest + factories in `conftest.py`. A PoC is a test that creates two orgs, authenticates as org B, and asserts org A's object is not readable/writable.

## Next.js (app router and pages router)

- **Auth**: `middleware.ts`/`proxy.ts` matchers skip paths; page-level `auth()`/`auth.protect()` missing on a new page; route handlers (`app/**/route.ts`) and server actions (`"use server"`) must re-check auth and ownership themselves — they are public HTTP endpoints.
- **Env**: anything `NEXT_PUBLIC_*` ships to the browser.
- **Headers**: `next.config` `headers()` for CSP/`frame-ancestors`, HSTS, nosniff, Referrer-Policy, Permissions-Policy; `poweredByHeader: false`. Roll CSP out as Report-Only first.
- **Redirects**: `redirect()`/`router.push()` with `?next=`/`callbackUrl`/`returnTo` values.
- **Rendering**: `dangerouslySetInnerHTML`, markdown, `href={userValue}` (`javascript:`), `images.remotePatterns` with wildcards.
- **Image/OG/proxy routes**: server fetch of DB or user URLs; `redirect: "error"` or re-validate host after redirects.

## tRPC + Prisma + MongoDB

- **Procedure tier**: every `publicProcedure` mutation is an unauthenticated write. Check rate limits, input bounds (`z.string().max`, `z.array().max`, numeric ranges), and what shared state it can poison (catalogs, indexes, embeddings).
- **Raw queries**: `aggregateRaw`, `$runCommandRaw`, `findRaw` with user-built pipelines; Mongo operator injection when objects (not strings) reach `where`.
- **Uniqueness**: `findFirst` then `create` without a unique index is a race.
- **Errors**: `TRPCError` messages that echo internal `err.message`.
- **Tests**: `createCaller(ctx)` against routers with a mocked prisma.

## Vite/React SPA + Firebase auth

- **Authorization is the backend's job**: hidden buttons are UX. Any "admin" surface gated only in the client is a finding only if the backend endpoint also lacks the check — trace it into the API repo.
- **Tokens**: Firebase ID tokens live in IndexedDB; XSS = token theft. CSP and output encoding matter.
- **Rendering**: `dangerouslySetInnerHTML`, markdown renderers on user/LLM/email content (sanitize with DOMPurify), `window.open(userUrl)`, `href` from API data without a scheme check.
- **Env**: everything `VITE_*` is public. Firebase web config is public by design; service-account JSON, API secrets, and admin tokens are not.
- **Hosting headers**: `firebase.json` `hosting.headers`.

## GitHub Actions

- `pull_request_target`/`workflow_run` that checks out PR code with secrets in scope.
- `${{ github.event.pull_request.title }}`, `head_ref`, issue/comment bodies, or `inputs.*` interpolated into `run:` — move to `env:` and quote.
- Top-level `permissions: contents: read`; widen per job only where needed.
- Pin third-party actions to a full commit SHA (first-party `actions/*` may stay on major tags).
- Secrets passed to steps that run third-party or PR-controlled code; LLM steps that read PR text and also hold write tokens.
- `workflow_dispatch` jobs that run prod management commands: who can trigger, which environment protection applies.

## Cloud Run / GCP / Doppler

- Service accounts with project-wide roles; jobs sharing the API's identity.
- `--allow-unauthenticated` on internal services; Cloud Scheduler → job auth.
- Secrets passed as plain env in YAML instead of Secret Manager/Doppler mapping.
- These are mostly `needs_validation`: the repo shows intent, the console shows truth. Ask an owner to observe the setting.
