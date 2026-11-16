# Threat model — <repo>

The `security-harness` skill reads this file before every security review and audit. Keep it short, factual, and current. Update it in the same PR that changes a boundary, adds an entry surface, or adds an agent tool.

## Product and assets

What the product does and what an attacker would want: data (whose, how sensitive), money movement, account takeover, code execution, catalog/index integrity, third-party API quota.

## Principals

| Principal | How identity is established | Normal authority |
|---|---|---|
| Anonymous visitor | — | |
| Signed-in user | | |
| Admin / staff | | |
| Service accounts / CI / webhooks | | |
| LLM agents / MCP clients | | |

## Trust boundaries and controls

| Boundary | Strongest control | Where (file) |
|---|---|---|

## Entry surfaces

Routers, procedures, server actions, webhooks, uploads/importers, scheduled jobs, LLM ingestion, MCP tools. Note which are unauthenticated.

## Approved MCP servers and agent tools

Which servers agents may connect to, what each tool can write, and which actions need a human gate.

## Repo-specific attack classes

Domain bugs generic scanners miss, each with a one-line hunting method.

## Running checks locally

Offline test/lint commands, and commands that are **prohibited** in audits (deploys, prod management commands, anything that fetches or publishes).

## Accepted gaps

| Gap | Why accepted for now | Owner | Revisit |
|---|---|---|---|
