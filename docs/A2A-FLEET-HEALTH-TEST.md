# A2A Fleet Health Test — Full Runbook / AI Prompt

A comprehensive, real-tests-only health check for every deployed A2A Agent in the
ecosystem: endpoints, protocol, knowledge-base grounding, gateway tools, model
path, secrets, on-chain neighbors registry, knocks, and chat-DB realtime.

Use it two ways:
- **As an AI prompt** — paste everything below the line into your AI assistant/coder.
- **As a human runbook** — each phase is a standalone checklist with exact commands.

---

## The Prompt

You are testing EVERY deployed A2A Agent in this ecosystem end-to-end. No simulated results — every check must be a real network call, real tool call, or real chain query. Record actual HTTP codes, response bodies (truncated), and timings.

### Inventory (do this first)
Enumerate all agents from: `~/.mother-brain/inventions/a2a-agent/projects/*/config.json`
Per project extract: `settings.agentName`, `settings.agentUrl`, `settings.workerName`, `settings.gatewayBaseUrl`, `settings.gatewayToken`, `settings.accessToken`, `settings.supabaseUrl` (chat DB), `settings.primaryProjectId`, `settings.botUserId`, `settings.neighborsEnabled`.
Also test public endpoints not in that list (examples from this deployment): `https://a2a.nearneighbors.network` (router — forwards to `KNICK_ENDPOINT`), `https://a2a.motherbrain.app`, `https://a2a.agentext.pro`.
NEVER print token values — lengths only.

### Phase 1 — Endpoint liveness + identity (per agent)
1. `GET {url}/` → expect 200 + service JSON (record `version`, `status`).
2. `GET {url}/.well-known/agent-card.json` → 200; record `name`, `description`, `url`.
3. `POST {url}/` body `{"jsonrpc":"2.0","method":"ping","id":1}` → expect HTTP 200 + `{"result":{"status":"ok"}}`. Record non-2xx as FAILURE (this is what the MB app health check probes).
4. Card name vs wizard `agentName` — exact-match check. Mismatch = warning (stale deploy or unaligned identity).

### Phase 2 — Real conversation (per agent)
`POST {url}/` `message/send` with a question ONLY answerable from that agent's knowledge base (pick a fact from their project KB folder). CRITICAL: do NOT set `metadata.source` (connection-test takes a fast path — invalid for KB testing). Wait for the completed task; capture the full agent reply.
Grade: GROUNDED (cites KB specifics) / GENERIC (plausible but no specifics = no tools) / PLACEHOLDER (echo/"coming soon").

### Phase 3 — Which model actually answered (the silent-fallback detector)
For wizard-deployed workers, run `npx wrangler tail {workerName} --format pretty` (from a dir with wrangler auth), send one message, then read logs:
- FAIL if: `[gateway-health] Gateway returned 404 — clearing token` → `MOTHER_BRAIN_GATEWAY_TOKEN not set` → `workers-ai … glm-4.7-flash with 3 tools` (known systemic issue: Cloudflare Bot Fight Mode blocks Worker→workers.dev fetches)
- PASS if: `Gateway is reachable` and/or `MCP: Discovered N tools` / `MCP: Calling tool …`

### Phase 4 — Gateway + tools (from this machine, per agent)
Using that agent's wizard tokens, curl `{gatewayBaseUrl}`:
1. `tools/list` with headers: `Authorization: Bearer {gatewayToken}`, `X-Mother-Brain-Source: a2a-agent`, `X-Mother-Brain-Invention: a2a-agent`, `X-Mother-Brain-User-Token: {accessToken}` → expect 13 tools incl. search_codebase/search_memories.
2. `tools/call get_project_stats` → record Code Index / Knowledge Memory / Chat Messages counts per project.
3. `tools/call search_codebase` with a known-fact query → must return real chunks with similarity scores.
READ-ONLY tools only — do NOT call add_memory, gateway_generate_token, or gateway_sync_users.

### Phase 5 — Secrets presence (per wizard worker)
`npx wrangler secret list --name {workerName}` → verify exists: MOTHER_BRAIN_GATEWAY_TOKEN, MOTHER_BRAIN_USER_TOKEN, GATEWAY_BASE_URL, MB_SUPABASE_URL, MB_SUPABASE_SERVICE_KEY, MB_PROJECT_ID, SUPABASE_URL, SUPABASE_SERVICE_KEY, AGENT_NAME, AGENT_URL. Names only — never values.

### Phase 6 — Neighbors network (real chain + real knocks)
1. Registry read: RPC `query` call to `nearneighbors.near` method `get_agents` (and `get_named_lists` if present) via `https://rpc.fastnear.com` — record every registered agent + compare against fleet inventory (registered vs deployed mismatches).
2. Knock test (only for agents with neighborsEnabled): `POST {url}/neighbor` knock — prefix the message with "HEALTH-TEST" so it's identifiable; verify a real response and log the knock/deal record it creates (report it for manual cleanup — do not delete).
3. Agent card check on the registry: does each registered entry's domain serve a live agent card?

### Phase 7 — Chat DB + live messages (per agent)
1. `GET {chatDbUrl}/rest/v1/` with service key → 200.
2. Realtime publication: query `pg_publication_tables` (or run the idempotent check SQL from `backend/schema/016_realtime_publication.sql`) — `tasks` + `task_messages` MUST both be members, else live messages never reach the Conversations screen (known incident class).
3. Row counts: tasks + task_messages (recent activity check).
4. After the Phase 2 message, confirm the message landed in task_messages (visitor chat history).

### Report format
Per agent: scorecard table — Endpoint | Ping | Card identity | Conversation grade | Model path (gateway vs fallback) | Tools (13?) | KB grounding | Secrets | Registry | Knocks | Chat DB + realtime — each ✓/⚠/✗ with one-line evidence. End with: prioritized fix list (owner + exact action), and a fleet-wide section for systemic issues (e.g., Bot Fight Mode affecting all workers at once).

---

## Operational notes

1. **Known fleet-wide issue**: wizard-deployed workers can silently fail Phase 3 (Cloudflare Bot Fight Mode blocks Worker→`workers.dev` fetches → the gateway-health probe gets a 404 → every reply comes from the tiny Workers-AI fallback instead of the gateway model + 13 KB tools). If the whole fleet fails Phase 3 identically, check CF dashboard → Security → Bots **before** debugging individual agents — the test will re-confirm the systemic diagnosis otherwise.
2. **Cleanup**: Phase 2 messages and Phase 6 knocks create real records (tasks in chat DBs, knocks/deals in the Neighbors CRM). Knock messages are prefixed `HEALTH-TEST` for identification — delete them from the Deals/Knocks screens afterward.
