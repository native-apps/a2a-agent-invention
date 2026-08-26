# NEAR Neighbors — Feature Manifest

> The owner's manual + build ledger for the Neighbors B2B agent network.
> Philosophy: **owners set the goals and purpose; the agents knock and talk; real
> plans come back for owner approval.** Everything natural language — referral
> codes/links live in Stripe or the owner's merchant; agents present offers.
>
> Current version: **1.2.203** (2026-08-26). Worker-side changes need a
> **Redeploy**; Goals/Targets/SOPs/Autonomy/Schedule deploy as worker vars.

---

## ✅ Shipped — the owner's console (app side)

### Registry (the lean phone book — onchain)
- Live onchain registry view — `get_agents` from `neighborly.testnet` via free
  public RPC, 5-min cache (v1.2.172+)
- ★ Favorites / 👁 Watched — card toggles + filter pills (v1.2.177)
- **#Tags = curated lists** (v1.2.184) — `+ tag` on any card; each tag IS a
  local list, filterable via `#tag (n)` pills. Multiple tags → multiple lists
  (SaaS, Marketing, Freelancers…). *(Next: website feeds — see Planned.)*
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

## 📐 Next up (user's order)

### 1. Tags → website display ← START HERE NEXT SESSION
- Dynamic feeds per tag list so owners can display their curated neighbor
  lists on their own websites (SaaS page, Marketing page…)
- Integrates with the planned website front-end layer
  (motherbrain.app/neighbors + agentext.pro/partners); test on both sites
- Later: official **$NEAR Neighbors button** for listing sites + onboarding
  flow (register a Neighbors listing BEFORE getting the MB app)

### 2. The Spider Agent (discovery at scale)
- Onchain at **market.near.ai** so anyone can pay to use it; likely $NEAR gas;
  users pay (registry may reach thousands×millions)
- Consumes enabled **Goals** as discovery intent; plugs into the heartbeat as
  an additional target source
- **Seed data first**: a large list of FAKE neighbors on the registry (all
  kinds of businesses/websites, diverse fake data) to test Spider discovery +
  matching at scale — seeding script/testnet plan is part of this build

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
  `HEARTBEAT_ENABLED`, `HEARTBEAT_SCHEDULE_JSON`
- **Agent's Supabase**: `deals` table (durable source of truth),
  tasks/task_messages (`neighbor:{domain}` threads), entities
- **Hard-won LLM rules** (from AI SOP work): JSON only for multi-item output
  (+ repair pass — models emit raw newlines inside strings); single-item
  generation uses plain-text `TITLE:`/`BODY:` delimiters; thinking-style
  models need generous max_tokens (reasoning burns budget → empty content)
