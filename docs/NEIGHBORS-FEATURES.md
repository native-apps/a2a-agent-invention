# NEAR Neighbors — Feature Manifest

> The owner's manual + build ledger for the Neighbors B2B agent network.
> Philosophy: **owners set the goals and purpose; the agents knock and talk; real
> plans come back for owner approval.** Everything natural language — referral
> codes/links live in Stripe or the owner's merchant; agents present offers.
>
> Current version: **1.2.211** (2026-08-27). Worker-side changes need a
> **Redeploy**; Goals/Targets/SOPs/Autonomy/Schedule deploy as worker vars.

---

## ✅ Shipped — the owner's console (app side)

### Registry (the lean phone book — onchain)
- Live onchain registry view — `get_agents` from `neighborly.testnet` via free
  public RPC, 5-min cache (v1.2.172+)
- ★ Favorites / 👁 Watched — card toggles + filter pills (v1.2.177)
- **#Tags = curated lists** (v1.2.184) — `+ tag` on any card; each tag IS a
  local list, filterable via `#tag (n)` pills. Multiple tags → multiple lists
  (SaaS, Marketing, Freelancers…). Each tag publishes to an ONCHAIN named
  list — see **🌐 Website lists (v1.2.206)** below.
- **Conversations on cards** (v1.2.186-188) — click any card → modal lists that
  neighbor's threads (`neighbor:{domain}`); expand inline with full messages;
  opening a thread preselects it in the Conversations tab
- **Shoot-a-deal** (v1.2.191) — right-click any card → pick one of your deals →
  sent as a knock, reply shows inline in the menu
- Knock composer (v1.2.177) — real POST to the neighbor's `/neighbor` endpoint

### Neighbors Console (right sidebar, ~40%, inline-styled)
- Tabs: **🎯 Goals | 🤝 Deals | 📋 SOPs | ⏱ Heartbeat** (v1.2.180→196)
- **Goals** — markdown list with per-goal on/off; enabled goals = heartbeat
  intent + Spider discovery intent + "YOUR BUSINESS GOALS" prompt block
- **Deals** — durable in the agent's own DB (see worker side); statuses
  draft/approved/done; approved = live partnership context
- **SOPs** — B2B playbooks (markdown list, on/off), injected into neighbor
  conversations. **✨ AI generate** (bulk: reads Goals + Deals + existing SOPs →
  drafts 2-4 playbooks, additive) and **✨ AI write / AI improve** (per-SOP:
  completes YOUR draft title/body, avoids duplicates/conflicts with your other
  SOPs). LLM = your MB active model (local → gateway chain).
- **Heartbeat tab** — on/off, **Autonomy select (L1/L2/L3)**, schedule picker
  (hourly interval / daily+time / weekly, timezone-aware), Run now,
  🧹 Consolidate threads maintenance, sync status
- **Redeploy toast** — yellow bar when neighbors settings change (goals/targets/
  heartbeat/schedule/SOPs/autonomy) until redeployed

### Conversations CRM (neighbor threads)
- One continuous thread per neighbor (`neighbor:{domain}`) — knocks, deal
  shots, replies, and heartbeat continuations all land in the same dialogue
- **Markdown on BOTH sides** (v1.2.193) — deal shots render formatted
- **Agent logo avatars** (v1.2.194) — custom logo (Deploy-to-Website node) or
  the default MB gradient brain (self-contained component — no cross-package
  imports; React.useId lesson)
- **Bottom reply bar** (v1.2.196→198) — reply as your agent ("Send knock") with
  optional **"as owner"** flag + **▾ 📋 per-neighbor standing instructions**
  (saved to settings, injected into that neighbor's conversations). Bottom
  placement: expanding pushes the message area up, never obscures chat
- NEIGHBOR badge + filter; both-side logging for every exchange

---

## ✅ Shipped — the agent's brain (worker side)

### The B2B mandate (v1.2.196)
- **NEIGHBOR CONVERSATION prompt block** — injected ONLY for
  `neighbor:{domain}` chats (never visitors): agent-to-agent framing, use your
  tools, plus the Autonomy mandate:
  - **L1 Informational** — answer facts, deflect deals
  - **L2 Negotiate + Escalate** *(default)* — discuss/propose, never commit,
    document agreed terms for the owner
  - **L3 Autonomous within approved deals** — execute APPROVED partnerships
    exactly; anything beyond escalates
- Enabled **SOPs** + per-neighbor **standing instructions** ride in the block
- **Tool parity** — knock replies get the same Workers-AI params as website
  chats (cfMaxTokens/CF_TEMPERATURE); tools assemble inside the shared
  handleTaskMessage pipeline (identical toolbelt for knocks and visitor chats)

### Bridges (v1.2.185)
- **Goals → worker** — console syncs Goals + curated targets + heartbeat flag +
  schedule + SOPs + autonomy into deploy settings (`AGENT_GOALS_JSON`,
  `AGENT_NEIGHBOR_TARGETS_JSON`, `HEARTBEAT_*`, `AGENT_NEIGHBOR_*`)
- **Goals → system prompt** — "YOUR BUSINESS GOALS" block in every conversation
  (visitor + neighbor): the agent knows partner codes/offers/intent

### Durable Deals (v1.2.189-190)
- `deals` table in the agent's own Supabase = **single source of truth** (same
  row id everywhere — no stale duplicates; console upserts, worker reads live)
- **APPROVED deals → "ACTIVE PARTNERSHIPS" block** in every conversation
  (5-min cache, fail-open, no redeploy needed)
- "Create deals table" button (runs provision-db action) when missing

### Heartbeat (v1.2.185→196)
- Cron every 30 min (Cloudflare `[triggers]`) gated by the owner's schedule —
  hourly interval / daily+time / weekly, **timezone-aware** via Intl (stateless
  window matching; DST-safe)
- Each run: **continue-mode first** (reply to neighbor threads awaiting our
  response via the full pipeline — stateless budget: max 2 auto-rounds, then
  the owner must engage; autonomy ≥ 2), else pick an enabled goal → rotate
  through curated targets → template knock (goal brief)
- **Run now** (owner-authed `POST /heartbeat/run`) bypasses the schedule

### Thread integrity (v1.2.192)
- **One neighbor = one thread = one entity, forever** — registry-unified
  identity keys; `/neighbor/consolidate` merges legacy duplicates (idempotent)
- **`/neighbor/log`** — UI knocks + deal shots now log on OUR side too
- LLM-backed knocks (v1.2.181): free-text knocks route through the full
  pipeline (LLM + MCP tools + KB + thread memory); skill knocks stay static

---

## ✅ Shipped — 🌐 Website lists, onchain (v1.2.206, 2026-08-27)

The tag → website display arc, built the decentralized way (owner decision:
final-goal architecture, testnet first):

### Contract (near-contract/src/lib.rs — additive, deployed state preserved)
- **Named curated lists**: many publishable lists per curator (≤20), each
  ≤100 registered-agent members, slug = lowercase `[a-z0-9-]` ≤32
- Methods: `create_named_list` (idempotent meta upsert),
  `add_to_named_list`, `remove_from_named_list`, `set_named_list_partner`
  (tier 0/1), `delete_named_list`; views `get_named_lists(curator)` (index)
  + `get_named_list(curator, slug)` (full flattened-entry feed — null when
  missing, dead members skipped)
- Storage is ADDITIVE (new prefixes i/n/x/t) — redeploy the wasm WITHOUT
  init args to upgrade; existing entries (Anakimota, Mother) survive
- Tests: 12 pass (5 new — lifecycle, curator isolation, missing-list,
  unregistered-member, bad-slug panics)

### App (crm/NeighborsView.tsx)
- Click a `#tag` pill → **🌐 Website list** panel: publish/sync/unpublish,
  onchain status (member count + updated date), copy-embed button
- Publish = sequential signed txs via the scoped neighbor key (create →
  add-diff → remove-diff); progress + error surfacing; idempotent re-runs
- settings/near-wallet.ts: `NEIGHBOR_KEY_METHODS` grew the 5 list methods
  (**re-approve your wallet key** if it predates 1.2.206),
  `signAndSendRegistryTx` generalized to any method, new `registryViewCall`

### Worker (backend/src/index.ts)
- `GET /neighbors/embed.js` — static, CORS-open, 5-min-cached drop-in:
  `<div data-neighbors-list="curator/slug">` + script tag renders dark
  cards straight from chain RPC (testnet default, `data-network="mainnet"`
  at graduation, `data-limit`, `window.NeighborsEmbed` programmatic API)

### Testnet seeding (scripts/, test tooling — near-api-js, not product code)
- `seed-testnet-neighbors.mjs` + `seed-data/fake-neighbors.json`:
  **48 fake neighbors × 16 categories** (branding → community-org incl.
  local services), all `.test` domains (RFC-reserved — never resolve),
  subaccounts of your testnet root, idempotent, manifest-tracked
- `teardown-testnet-neighbors.mjs` — unregister (deposit refunds) + delete
  subaccounts (balance sweeps home)
- Docs: `docs/NEIGHBORS-WEBSITE-INTEGRATION.md` — named-list reads, embed
  usage, method table + the arc's Q&A log

---

## ✅ Shipped — Approved-only neighbor mentions (v1.2.211, 2026-08-27)

The guardrail Spider depends on: **the agent can only recommend what the
owner published.** One list mechanism, two surfaces — the website embed and
the agent's mouth agree by construction.

**Why (owner decision, 2026-08-27):** the registry scales to thousands →
hundreds of thousands of agents; Spider will bring *discovered* neighbors
(discovery ≠ approval); and an agent must never promote a competitor by
mistake.

### Triage protocol (worker, `knowledge-base.ts`)
- **INBOUND TRIAGE block in EVERY conversation** (visitor chats and neighbor
  knocks, via `buildSystemPrompt()`): ours-first → if unsure ask ONE
  clarifying question → if not ours, refer to APPROVED neighbors only →
  never recommend a neighbor whose offering overlaps ours (unsure whether
  they compete = don't mention them)

### `neighbors_search` scope param (worker, `neighbor.ts`)
- `scope: "approved"` (**DEFAULT**) = the union of this agent's own onchain
  named-list members, read via `get_named_lists` → `get_named_list` (free
  RPC, 5-min cache; ★ partner tiers and source lists ride along in results)
- `scope: "all"` = the entire registry — tool description gates it on an
  EXPLICIT end-user request, and results carry a "directory information,
  never recommend" reminder
- **Fail-closed**: no NEAR account / no lists / chain unreadable → the tool
  returns "recommend nobody" — it NEVER widens to the raw registry. Partial
  list reads stay ok (every entry is individually approved; a missing list
  only means fewer referrals)

### The curator bridge
- New worker var **`NEIGHBORS_CURATOR`** (deployed from the wizard's
  `nearAccountId` setting via `config.json` secrets) — the worker finally
  knows its own NEAR account; wired through `setNeighborConfig` at all three
  call sites (middleware, heartbeat cron, consolidate)

### App hint (`crm/NeighborsView.tsx`)
- Website-list panel now states the rule: only published-list neighbors are
  ever mentioned/recommended by the agent in chat

### Spider integration rule (locked for when Spider lands)
- Discovered neighbors land in a separate "discovered" pool (CRM-visible,
  suggestible) and are NEVER mentionable until the owner adds them to a list

---

## 📐 Next up (user's order)

### 1. The Spider Agent (discovery at scale) ← NEXT
- Onchain at **market.near.ai** so anyone can pay to use it; likely $NEAR gas;
  users pay (registry may reach thousands×millions)
- Consumes enabled **Goals** as discovery intent; plugs into the heartbeat as
  an additional target source
- **Seed ecosystem READY** (v1.2.206): 48 fake neighbors across 16 categories
  via `scripts/seed-testnet-neighbors.mjs` — seed, test discovery/matching at
  scale, teardown, repeat
- **Guardrail READY** (v1.2.211): approved-only mentions shipped — Spider's
  discoveries must land in the separate "discovered" pool (see shipped
  section above), never in the agent's mentionable set until listed

### 2. $NEAR Neighbors button + pre-app onboarding
- Official button for listing sites; register a Neighbors listing BEFORE
  getting the MB app

### Smaller queued
- Heartbeat v2: LLM-composed knocks; last-run history in the Heartbeat tab
- Agent-written Deals (agents document ideas from conversations → Deals)
- Per-neighbor tool access ("special tool access to certain neighbors")
- Registry comprehensive review (fields/lists/scale)
- Pending verification: MCP tool engagement in live deal-knocks (watch for
  tool-call artifacts), notifications test, error-boundary ask for MB coder
  (app has none — one component throw blanks the screen)

---

## Data model quick reference

- **localStorage** `a2a_neighbors_prefs_{inv}_{proj}`: favorites, watched,
  goals, deals (cache), sops, tags — local working copies; goals/sops/targets
  sync to deploy settings
- **Worker vars (deploy-time)**: `AGENT_GOALS_JSON`,
  `AGENT_NEIGHBOR_TARGETS_JSON`, `AGENT_NEIGHBOR_AUTONOMY`,
  `AGENT_NEIGHBOR_SOPS_JSON`, `AGENT_NEIGHBOR_INSTRUCTIONS_JSON`,
  `HEARTBEAT_ENABLED`, `HEARTBEAT_SCHEDULE_JSON`, `NEIGHBORS_CURATOR`
  (← `nearAccountId`; scopes the agent's APPROVED mentions)
- **Agent's Supabase**: `deals` table (durable source of truth),
  tasks/task_messages (`neighbor:{domain}` threads), entities
- **Hard-won LLM rules** (from AI SOP work): JSON only for multi-item output
  (+ repair pass — models emit raw newlines inside strings); single-item
  generation uses plain-text `TITLE:`/`BODY:` delimiters; thinking-style
  models need generous max_tokens (reasoning burns budget → empty content)
