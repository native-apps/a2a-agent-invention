# A2A Agent Invention — License-Free by Default + Generic Logged-In Visitors

**Created:** 2026-08-08
**Status:** Implemented in v1.2.129
**Owner:** A2A Agent Invention coder

## The product principle

The A2A Agent Invention is for **everyone** — any website should be able to deploy
an agent that works immediately. The Mother Brain License Key system is a
**bonus capability** for companies that sell licensed software — it must never
gate a generic website agent.

Three visitor types must all work:

| Visitor type | How the agent treats them |
|---|---|
| **Public visitor** | Anonymous. Just `visitor_id` — no license, no login. |
| **Logged-in user** | Generic `metadata: { authenticated: true, user_id: "...", email: "..." }` — vendor-neutral, no Mother Brain/Encore dependency. |
| **License owner** | Optional. If the website sells licenses and configures Encore (`ENCORE_API_URL`/`ENCORE_API_KEY`), `license_key` resolution links chats to the customer. Skipped entirely when unconfigured. |

## What was implemented (v1.2.129)

### 1. License system is OPTIONAL — never required
- License resolution already degraded gracefully (`license-resolver.ts` returns
  `visitorId: null` when Encore is unconfigured or the lookup fails).
- **New:** all DB writes now **tolerate missing optional columns**. `insertResilient()`
  (in `task-handler.ts`) tries the full insert, then retries without
  `license_key`/`customer_id`, then with absolute base columns. A fresh Supabase
  project with only the base schema accepts `message/send` immediately.
- Applies to: `task_messages` (user + agent), `tasks` (create), and the Telegram
  task creation path.

### 2. Generic "logged-in visitor" identity (vendor-neutral)
- `message/send` now accepts `metadata: { authenticated: true, user_id: "...", email: "..." }`
  and stores `user_id` as `customer_id` — without any license config.
- JWT/bearer verification (via `JWT_SECRET`) remains the recommended secure path
  for websites with their own session tokens; the metadata path is the
  convenience path that trusts the website's own auth layer.

### 3. Schema robustness
- `backend/schema/001_initial.sql` is now idempotent (`CREATE TABLE IF NOT EXISTS`).
  All migrations use `IF NOT EXISTS` / `CREATE OR REPLACE`, so the schema can be
  applied repeatedly.
- **One-shot schema:** `docs/a2a-agent-supabase-schema-full.sql` — paste the whole
  file into the Supabase SQL Editor to create/upgrade the full schema in one step.
- The `provision-db` action (MB app, `supabase-provision`) applies
  `backend/schema/*.sql` in sorted order; it requires the `exec_sql` RPC or manual
  SQL Editor application.

### Success criteria (test)
1. Brand-new Supabase project + base schema → `message/send` with just
   `{ visitor_id }` succeeds; agent replies via Workers AI / gateway.
2. `message/send` with `metadata: { authenticated: true, user_id: "user-123" }`
   marks the visitor as a registered user (stored as `customer_id`) — zero
   license config.
3. `message/send` with a `license_key` works when Encore is configured; silently
   degrades to anonymous when it isn't.

## Known follow-ups (later — different websites have different auth)
- Per-website "logged-in" providers (OAuth, magic links, SSO) — a general
  "Logged-in" abstraction beyond the generic metadata field.
- Per-product license formats beyond Mother Brain's.
- The `entities.customer_id` column is `INTEGER` while the generic `user_id` is a
  string — the `upsert_entity` RPC already degrades via try/catch, but a future
  migration could widen it to TEXT for full generality.
