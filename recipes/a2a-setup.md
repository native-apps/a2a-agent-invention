# Recipe: A2A Agent Setup (Wizard 2 — Local First)

> **MAINTENANCE RULE** — This recipe is the AI Setup Assistant's ONLY knowledge
> source inside Wizard 2. Whenever a Wizard 2 step is added or changed
> (`settings/A2aWizard2.tsx`), this recipe MUST be updated in the same change so
> the assistant never gives stale guidance.

## Wizard 2 Step Map

| # | Step | Status |
|---|------|--------|
| 1 | **Agent Identity** | Live in Wizard 2 (11 slides) |
| 2 | **Deploy to Website** | Live in Wizard 2 (3 slides) — widget bundle + A2A endpoint, local-first |
| 3 | **Agent Cloud Mirror** | Live in Wizard 2 (7 slides) — always-on: MCP Mirror + 2 Supabase DBs + Cloudflare deploy |
| 4+ | Telegram · Website MCP · License Keys · advanced | Being reorganized into Wizard 2; available today in classic Settings & Wizard |

## Node Unlock Rules

All wizard nodes are ALWAYS VISIBLE on the canvas — but dimmed (35% opacity,
not-allowed cursor) and non-clickable until their prerequisites are complete.
Hovering a locked node shows a tooltip with exactly what's missing.

| Node | Unlocked when |
|------|---------------|
| Agent Identity | Always (the starting step) |
| Deploy to Website | Agent Identity complete (bot user chosen + agent name + description) |
| Agent Cloud Mirror | Identity complete AND the A2A endpoint set in Deploy to Website |

Future nodes follow the same pattern — tell the user which node unlocks next
and what it needs.

## Step 1 — Agent Identity (live in Wizard 2)

The identity fields in Wizard 2 are TRUE MIRRORS of Settings → Agent Identity &
Authentication: same storage, same save path. Editing either screen updates the
other, 100% of the time.

### Slide 1: Choose the Bot User
- The bot user IS the agent's identity — name, bio, and access token flow from it.
- Create one in Mother Brain: Project → Users → add user of type AI Agent.
- Selecting one auto-populates Agent Name, Provider, Description (from bio), and
  the Access Token. Users list is fetched from the ACTIVE project only.
### Slide 2: Agent Name
- Deployed to the Worker as `AGENT_NAME`. Shown in the chat header, the Agent
  Card, and the system prompt. Auto-filled from the bot user; freely editable.
### Slide 3: Agent Description
- Deployed as `AGENT_DESCRIPTION`. Shown in the Agent Card and used in the
  system prompt. One or two sentences on what the agent does.
### Slide 4: Organization / Provider
- Shown as the provider in the Agent Card. Usually the company/product name.
  Defaults to the agent name if left empty.
### Slide 5: Access Token
- The bot user's key for authenticating with the MCP Gateway (Bearer, Zero
  Trust attribution). Auto-populated from the bot user; "Rotate Token"
  regenerates it via the project's user API. Never share it.
### Slide 6: AI Model
- Which LLM powers the agent. "Default (MB Active LLM)" = the model set in MB
  App Settings; the dropdown lists those models. LOCAL-FIRST: no Cloudflare
  needed — the agent runs on the local Mother Brain + MCP Gateway.
### Slide 7: Response Settings
- Max Tokens (response length, default 1024) and Temperature (creativity 0–2,
  default 0.7). Same fields/keys as Settings; they also shape the setup
  assistant's own replies.
### Slide 8: Vectorization
- Embeddings for the agent's CHAT DB (Visitor Total Recall): every visitor
  message is vectorized (task_messages.embedding, VECTOR(1024) + HNSW index) so
  returning visitors get eternal conversation recall. Same key also powers the
  offline knowledge-base fallback when the Gateway is unreachable.
- Fields: Embedding Provider (Voyage AI / OpenAI), Model (default
  voyage-4-large), API Key (Fetch button auto-fills from the project's
  embedding configuration), Vector Dimensions (must match the DB column —
  1024 for voyage-4-large).
### Slide 9: Agent Skills
- Skill cards (name, description, tags, example requests) with add / remove /
  reorder, plus AI Suggest Skills (drafted by the local LLM, user picks).
  Skills publish to the Agent Card and deploy as AGENT_SKILLS_JSON.
### Slide 10: Project Access
- Primary Knowledge Base Project: LOCKED to the current project (the A2A Agent
  is project-specific — this prevented a real cross-project corruption bug).
- Additional Context Projects (Brainstorm Mode): optional extra projects the
  agent may read for context.
### Slide 11: Agent Card & Review (the FINALE)
- Readiness checklist → full summary card → Agent URL (the A2A endpoint;
  filled after deploy or a custom domain) → the LIVE AGENT CARD preview
  (served at /.well-known/agent.json — this is how other agents discover
  yours) with Copy JSON. Everything on this slide reflects the shared
  settings — editing in Wizard 2 or Settings keeps both in sync.

## Step 2 — Deploy to Website (live in Wizard 2 — UNLOCKED by completing Agent Identity)

LOCAL-FIRST: the agent is already alive through the MCP Gateway → local
Mother Brain app (MCP tools + local Postgres chat DB). No Cloudflare, no
Supabase required at this stage. This step hands the agent to the website's
own codebase. The node stays dimmed/locked on the canvas until Agent Identity
is complete.

### Slide 1: The A2A Endpoint
- The Agent URL where the website reaches the agent (JSON-RPC 2.0, A2A
  standard). The website's coding AI establishes this endpoint when wiring the
  widget; paste it back here when set (turns the canvas node green).
- "Test Endpoint" runs the health-check action against the URL.
### Slide 2: Chat UI Style
- Primary Color, Hero Search Gradient (two colors), Branding Text, Agent Logo
  (URL or upload → data URL), Display Options (Show MCP Tool Calls / Thinking /
  Reasoning). Same fields as Settings → Chat UI.
### Slide 3: Build the Widget (finale — two stacked, numbered buttons)
- Button **"1. Build and Download Widget"** downloads motherbrain-widget.zip —
  self-contained React/TypeScript sources (ChatWidget with hero → bar → overlay
  state machine, HeroSearchHost + <ne-hero-search> web component, ChatApp,
  markdown renderer, visitor identity, suggestion cache). Only react/react-dom
  needed.
- Button **"2. Copy Embedding Code & Prompt Instructions"** copies BOTH to the
  clipboard in one click: the embedding snippet (HeroSearchHost + ChatApp wiring
  with the user's live endpoint/colors prefilled) AND the coding-agent prompt
  (file-by-file zip inventory, integration steps, live endpoint/agent name, key
  details — props, caching, Shadow DOM, React 18+, JSON-RPC 2.0 — and that the
  agent connects to the user's Mother Brain project via the MCP Gateway).
- The snippet code and prompt text are NOT displayed on the slide — the copy
  button is the only way to get them ("2. Copied!" confirms for 2 seconds).
- Workflow: download the zip, click copy, hand both to the website's coding AI
  (Cursor, Zed, Claude Code…). It establishes the A2A endpoint on the website
  and wires the chat in; the endpoint then goes back into slide 1 (the canvas
  node turns green).

## Step 3 — Agent Cloud Mirror (live in Wizard 2 — UNLOCKED by Identity + Website endpoint)

THE ALWAYS-ON STEP: the agent keeps answering even when the Mother Brain app
is offline. Requires DEPLOYING the A2A Agent to Cloudflare Workers — the
worker is what the website reaches, and it falls back to:
1. **Cloudflare MCP Mirror** — cloud-hosted MCP tools (the cloud copy of the
   Gateway; configured in MB App Settings).
2. **Project Knowledge Base (Supabase #1)** — the Mother Brain project's own
   Supabase (code index, memories) queried DIRECTLY when offline. Deployed as
   MB_SUPABASE_URL / MB_SUPABASE_SERVICE_KEY / MB_PROJECT_ID.
3. **A2A Chat History (Supabase #2)** — the CHAT DATABASE (NOT the project KB):
   cloud storage for conversations so they survive reboots. Synced from the
   local Postgres chat DB when "Sync to Supabase" is on.

### Slide 1: Why a Cloud Mirror? — the always-on story + live status of the 3 pieces.
### Slide 2: Cloudflare MCP Mirror — MCP Cloud Mirror URL (mcpCloudUrl;
LOCKED — auto-populates from MB App Settings, not editable here) + Force
Cloud MCP Server toggle (forceCloudMcp). Same storage as Settings → Deploy.
### Slide 3: Project Knowledge Base — ALL fields LOCKED (managed by Project
Settings; the invention grabs them for the CF Worker deploy):
Project Supabase URL (mbSupabaseUrl), Project ID (mbProjectId), Supabase Access
Token (mbSupabaseAccessToken), Service Role Key (mbSupabaseServiceKey —
auto-fetched via the Supabase Management API). "Fetch from Project" re-pulls
everything from the project config. Deployed as MB_SUPABASE_URL /
MB_SUPABASE_SERVICE_KEY / MB_PROJECT_ID Worker secrets.
### Slide 4: A2A Chat History — Supabase URL + Service Key (supabaseUrl /
supabaseServiceKey, Fetch from project config), Database Provider (local-pg /
supabase / both), Sync to Supabase toggle, local chat DB status + Start.
### Slide 5: Cloudflare Worker Model — the Workers AI model for offline
fallback (cfWorkerModel) + Force Cloudflare Worker Model (forceCfWorker).
These live HERE (not in Agent Identity) — they only matter once deployed.
### Slide 6: Deploy to Cloudflare — Account ID, API Token ("Edit Cloudflare
Workers" template), Worker Name, live deploy status, Deploy button.
Quirk: save → wait ~5s → deploy.
### Slide 7: Mirror Checklist — mirror + both Supabases + worker deployed.

NOTE — Cloudflare is OPTIONAL in Wizard 2's flow (Steps 1–2 are fully local).
The Cloudflare Worker Model (cfWorkerModel) and Force Cloudflare Worker
(forceCfWorker) fields live in Step 3 — Agent Cloud Mirror — because they only
matter once the agent is deployed. Cloudflare is for agents that must answer
while the Mother Brain app is offline.

## Classic Setup Flow (steps being reorganized into Wizard 2)

### Knowledge / Primary Project
- The primary project is the agent's knowledge source; picked automatically from
  the active project. Selecting a project auto-loads offline-fallback Supabase
  credentials (URL, project ID, service_role key) via the Supabase Management API.

### Local Chat Database
- Start via the `start-db` action (local Postgres, collection `a2a_agent_chat`).
  Verify `localPgStatus` is "running".

### Supabase Sync (optional)
- Enables cloud backup + multi-device conversations. Needs Supabase URL +
  service key; test the connection, then enable sync.

### Deploy to Cloudflare
- Needs Cloudflare Account ID + API Token ("Edit Cloudflare Workers" template —
  `Workers Scripts:Edit` covers code AND secrets) + Worker Name.
- Deploys code + secrets; identity fields ship as `AGENT_NAME`,
  `AGENT_DESCRIPTION`, `AGENT_PROVIDER`, tokens, and gateway vars.
- Known quirk: save settings → wait ~5s → deploy (4s save/deploy race).

### Chat Widget + Hero Search
- The Chat UI Widget is a self-contained React bundle (`Build Widget` in
  Settings). Drop into any React project: `<ChatWidget endpoint="https://…workers.dev" />`
  outside the router. Hero Search is built in — visitors type a search, hit
  ENTER, the fullscreen chat opens with their query.

### Verify Secrets (after deploy)
- Cloudflare Dashboard → Worker → Settings → Variables and Secrets: SUPABASE_URL,
  SUPABASE_SERVICE_KEY, MOTHER_BRAIN_GATEWAY_TOKEN, GATEWAY_BASE_URL,
  VOYAGE_API_KEY (+ optional TELEGRAM_BOT_TOKEN, JWT_SECRET), and vars
  ENVIRONMENT, AI_MODEL, CF_WORKER_MODEL, FORCE_CF_WORKER.

## Trigger
- "set up a2a agent" · "configure my agent" · "a2a setup" · "help me set up the
  agent" · "wizard 2" · "agent identity" · "/mother a2a setup"

## Completion Message
✅ **Agent Identity is ready!** Bot user chosen, name/description/provider set,
token in place — everything synced with the Settings screen. Next wizard steps
(Knowledge Base, Models, Deploy…) are being reorganized into Wizard 2.

## Error Handling
- No agent users in the dropdown → create one in Project → Users (type AI Agent).
- Token missing → select the bot user again, or click Rotate/Generate Token.
- Fields out of sync with Settings → both screens share one config; re-open the
  screen or check you're in the same project (config is project-scoped).
- If DB start fails → "Could not start the local database. Try restarting Mother Brain."
- If deploy fails → check Cloudflare credentials and retry after saving settings.
