# Recipe: A2A Agent Setup (Wizard 2 — Local First)

> **MAINTENANCE RULE** — This recipe is the AI Setup Assistant's ONLY knowledge
> source inside Wizard 2. Whenever a Wizard 2 step is added or changed
> (`settings/A2aWizard2.tsx`), this recipe MUST be updated in the same change so
> the assistant never gives stale guidance.

## Wizard 2 Step Map

| # | Step | Status |
|---|------|--------|
| 1 | **Agent Identity** | Live in Wizard 2 (11 slides, incl. Finish & Verify) |
| 2 | **Deploy to Website** | Live in Wizard 2 (4 slides, incl. Finish & Verify) — widget bundle + A2A endpoint, local-first |
| 3 | **Agent Cloud Mirror** | Live in Wizard 2 (8 slides, incl. Finish & Verify) — always-on: MCP Mirror + 2 Supabase DBs + Cloudflare deploy |
| 4 | **MCP Server** | Live in Wizard 2 (3 slides, incl. Finish & Verify) — OPTIONAL website tools: read pages, navigate, accounts |
| 5 | **Telegram** | Live in Wizard 2 (3 slides, incl. Finish & Verify) — OPTIONAL bot channel: chat in Telegram |
| 6+ | License Keys · advanced | Being reorganized into Wizard 2; available today in classic Settings & Wizard |

## Node Unlock Rules

All wizard nodes are ALWAYS VISIBLE on the canvas — but dimmed (35% opacity,
not-allowed cursor) and non-clickable until their prerequisites are complete.
Hovering a locked node shows a tooltip with exactly what's missing.

| Node | Unlocked when |
|------|---------------|
| Agent Identity | Always (the starting step) |
| Deploy to Website | Agent Identity complete (bot user chosen + agent name + description) |
| Agent Cloud Mirror | Identity complete AND the A2A endpoint set in Deploy to Website |
| MCP Server | Identity complete AND the A2A endpoint set in Deploy to Website (OPTIONAL node) |
| Telegram | Identity complete AND the A2A endpoint set in Deploy to Website (OPTIONAL node) |

Future nodes follow the same pattern — tell the user which node unlocks next
and what it needs.

## Finish & Verify — every node's final slide (REAL diagnostics)

Clicking **Finish** on a node's last content slide opens one final diagnostic
slide. Each requirement is checked LIVE (settings presence AND real network
pings — nothing faked), rows animate in one-by-one, failures show red with an
error icon, and a SAVE button confirms persistence (settings already
auto-save every step — SAVE is for user confidence).

When a user reports a red row, walk them through fixing it — the checks and
their remedies:

### Agent Identity checks
1. **Bot user chosen (exists in this project)** — botUserId must be in the
   project's agent users list. Fix: re-select the bot user on slide 1.
2. **Access token present** — from the bot user. Fix: re-select the user or
   Rotate Token (slide 4).
3. **Agent name (automatic from the bot user)** — mirrors the Sub-Agent's name
   from the Users screen. Empty means the bot user has no name — set it in
   Project → Users.
4. **Agent description** — non-empty (slide 2).
5. **MCP Gateway connection** — gatewayBaseUrl (auto-grabbed from MB App
   Settings). Fix: open MB App Settings, set the MCP Gateway URL.
6. **Embeddings configured (Total Recall)** — embedding API key. Fix: the
   Fetch button on the Vectorization slide (slide 7) pulls it from the
   project config.

### Deploy to Website checks
1. **A2A endpoint set (valid URL)** — agentUrl, slide 1. Invalid/empty → paste
   the endpoint URL.
2. **Endpoint live (real health-check ping)** — runs the health-check action
   against the URL. Unreachable → the Worker may be down or the URL wrong.
3. **Agent Card served** — fetches /.well-known/agent-card.json live. Fails on
   404/unreachable; shows the deployed agent's name when it works.

### Agent Cloud Mirror checks
1. **MCP Cloud Mirror configured** — locked field from MB App Settings. Fix:
   set it in MB App Settings, then re-open the node.
2. **Project KB — Supabase #1 (live ping)** — GET {url}/rest/v1/ with the
   service key; verifies URL AND key. Fix: Fetch from Project (Project
   Knowledge Base slide) or check the project's Supabase settings.
3. **Chat History DB — Supabase #2 (live ping)** — same test on the chat DB.
   Fix: Fetch on the A2A Chat History slide.
4. **Cloudflare credentials** — Account ID + API token (Deploy slide).
5. **Knowledge Base packing** — kbFolder selected with ≥1 expected file found
   (SOUL.md/SECURITY.md/SKILLS.md). Fix: Cloudflare Worker Model slide; create
   templates with `node scripts/pack-knowledge-base.cjs --init`.
6. **Worker deployed (live Cloudflare proof)** — deployStatus/lastDeployedAt
   OR the live CF timestamp (health-check action, with a browser-direct
   versions-API fallback when the action returns none — see HANDOFF Part 19).
   Fix: run Deploy (save → wait ~5s → deploy).

### Checkup persistence (stored in the shared config)
- When the deployed check finds live Cloudflare proof, the config is written:
  deployStatus=deployed, lastCfDeployedAt (CF timestamp), lastDeployedAt (if
  unset) — i.e. the config records that the Agent IS deployed and the checkup
  detected it.
- Every checkup run stores lastCheckupAt (when it ran) and lastCheckupIssues
  (number of red rows). The Worker Name field locks once any of
  deployStatus/lastDeployedAt/lastCfDeployedAt says deployed.
- The Build the Widget slide shows the exact endpoint being embedded in the
  code/prompt (yellow warning when the endpoint isn't set) — after a Worker
  rename, re-copy there so websites get the NEW endpoint.

## Step 1 — Agent Identity (live in Wizard 2)

The identity fields in Wizard 2 are TRUE MIRRORS of Settings → Agent Identity &
Authentication: same storage, same save path. Editing either screen updates the
other, 100% of the time.

### Slide 1: Choose the Bot User
- The bot user IS your agent's identity — name, bio, and access token flow from it.
- Create one in Mother Brain: Project → Users → add user of type AI Agent.
- Selecting one auto-populates Agent Name, Provider, Description (from bio), and
  the Access Token. Users list is fetched from the ACTIVE project only.
- The Agent Name is AUTOMATIC — it mirrors the Sub-Agent's name from the Users
  screen (no separate Name step in the Wizard; renaming the Sub-Agent there
  updates the Agent on the next Wizard open). Still stored in config.json and
  deployed as AGENT_NAME.
### Slide 2: Agent Description
- Deployed as `AGENT_DESCRIPTION`. Shown in the Agent Card and used in the
  system prompt. One or two sentences on what the agent does.
### Slide 3: Organization / Provider
- Shown as the provider in the Agent Card. Usually the company/product name.
  Defaults to the agent name if left empty.
### Slide 4: Access Token
- The bot user's key for authenticating with the MCP Gateway (Bearer, Zero
  Trust attribution). Auto-populated from the bot user; "Rotate Token"
  regenerates it via the project's user API. Never share it.
### Slide 5: AI Model
- Which LLM powers your agent. "Default (MB Active LLM)" = the model set in MB
  App Settings; the dropdown lists those models. LOCAL-FIRST: no Cloudflare
  needed — the agent runs on the local Mother Brain + MCP Gateway.
### Slide 6: Response Settings
- Max Tokens (response length, default 1024) and Temperature (creativity 0–2,
  default 0.7). Same fields/keys as Settings; they also shape the setup
  assistant's own replies.
### Slide 7: Vectorization
- Embeddings for the agent's CHAT DB (Visitor Total Recall): every visitor
  message is vectorized (task_messages.embedding, VECTOR(1024) + HNSW index) so
  returning visitors get eternal conversation recall. Same key also powers the
  offline knowledge-base fallback when the Gateway is unreachable.
- Fields: Embedding Provider (Voyage AI / OpenAI), Model (default
  voyage-4-large), API Key (Fetch button auto-fills from the project's
  embedding configuration), Vector Dimensions (must match the DB column —
  1024 for voyage-4-large).
### Slide 8: Agent Skills
- Skill cards (name, description, tags, example requests) with add / remove /
  reorder, plus AI Suggest Skills (drafted by the local LLM, user picks).
  Skills publish to the Agent Card and deploy as AGENT_SKILLS_JSON.
### Slide 9: Project Access
- Primary Knowledge Base Project: LOCKED to the current project (the A2A Agent
  is project-specific — this prevented a real cross-project corruption bug).
- Additional Context Projects (Brainstorm Mode): optional extra projects the
  agent may read for context.
### Slide 10: Agent Card & Review (the FINALE)
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
  clipboard in one click: the embedding snippet (wrapped in a ```jsx fence so
  coding AIs parse it as code) with the user's live endpoint/colors prefilled,
  AND the coding-agent prompt
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
fallback (cfWorkerModel) + Force Cloudflare Worker Model (forceCfWorker) +
KNOWLEDGE BASE PACKING: CF Worker Files Folder (kbFolder — dropdown of the
project's sub-folders) and Expected Files toggles (SOUL.md, SECURITY.md,
SKILLS.md; green = found & included, strikethrough = excluded, gray = not
found). These files get baked into the Worker on deploy (same as Settings →
Knowledge Base Packing; templates can be created via
`node scripts/pack-knowledge-base.cjs --init`). Deploy-model fields live HERE
(not in Agent Identity) — they only matter once deployed.
### Slide 6: Deploy to Cloudflare — Account ID, API Token ("Edit Cloudflare
Workers" template), Worker Name, live deploy status, Deploy button.
Worker Name behavior: auto-fills `{agent-name}-a2a` (slugified Agent Name)
while untouched and NOT deployed — manual edits stop the auto-fill (clear the
field to resume). Once deployed (deployStatus/lastDeployedAt/lastCfDeployedAt)
the field LOCKS (🔒 deployed — unlock to rename); Unlock makes it editable
with a warning: renaming CREATES A NEW Worker — delete the old one in the
Cloudflare dashboard, update every website (re-copy the Embedding Code — it
bakes in the new endpoint) and update the endpoint on Website slide 1.
Quirk: save → wait ~5s → deploy.
### Slide 7: Mirror Checklist — mirror + both Supabases + worker deployed,
plus "Test Deployed Worker" (Run Test button): pings the live Worker and
verifies what actually shipped — Endpoint reachable (health-check action),
Agent Card name vs Agent Identity (stale-deploy detector), runtime MCP config
(gateway URL from /debug/mcp), and Cloudflare last-deployed timestamp.
Verification only — secrets are never read or shown.

NOTE — Cloudflare is OPTIONAL in Wizard 2's flow (Steps 1–2 are fully local).
The Cloudflare Worker Model (cfWorkerModel) and Force Cloudflare Worker
(forceCfWorker) fields live in Step 3 — Agent Cloud Mirror — because they only
matter once the agent is deployed. Cloudflare is for agents that must answer
while the Mother Brain app is offline.

## Step 4 — MCP Server (OPTIONAL — website tools via the website's MCP server)

Mirrors Settings → Website MCP Integration exactly (same fields, same storage,
same deploy secrets: MCP_BASE_URL / MCP_API_KEY / WEBSITE_URL). OPTIONAL:
when unset, the agent silently runs without website tools (graceful
degradation). Unlocks after Identity + the A2A endpoint are set.

### Slide 1: Connect Your Website's MCP Server
- Configured status dot (green when MCP Server URL + API key are set).
- MCP Server URL (mcpBaseUrl) — the website's MCP endpoint the agent calls for
  website.* tools (read_page, navigate, get_account, …).
- MCP API Key (mcpApiKey) — password-masked with reveal; DISTINCT from the
  Gateway Token (mb_mcp_… key).
- Website URL (websiteUrl) — where navigate/highlight links send visitors.

### Slide 2: Discover Website Tools
- "Discover Tools" fetches {A2A endpoint}/website-mcp/tools LIVE (through the
  deployed agent) and lists each tool's name + description. Requires the A2A
  endpoint (Deploy to Website slide 1). Errors show inline (red box).

### MCP Server checks (Finish & Verify)
1. **MCP Server URL set (valid URL)** — slide 1.
2. **MCP API key present** — slide 1.
3. **Website URL set** — slide 1.
4. **Website tools discoverable (live ping)** — GET {endpoint}/website-mcp/tools;
   passes with ≥1 tool, shows the first tool names. Fix: check MCP_BASE_URL /
   MCP_API_KEY and that the website's MCP server is up.
5. **Runtime MCP config (worker /debug/mcp)** — the DEPLOYED worker's
  isWebsiteMcpConfigured() verdict. If "NOT configured — redeploy after
  saving": the settings changed after the last deploy (save → wait ~5s →
  deploy via Agent Cloud Mirror).

NOTE: website tools are per-WEBSITE (the client's MCP server), NOT the
Mother Brain project MCP tools (those flow through the Gateway/Mirror).

## Step 5 — Telegram (OPTIONAL — visitors chat with the agent in Telegram)

Mirrors Settings → Telegram Integration exactly (same storage:
telegramBotToken; same deploy secret: TELEGRAM_BOT_TOKEN; same webhook:
{A2A endpoint}/webhook/telegram). OPTIONAL — empty token = disabled.
Unlocks after Identity + the A2A endpoint are set. Only text messages are
supported (no images/media, for security); messages land in the same chat
database with full MCP tool access.

### Slide 1: Connect the Telegram Bot
- Setup guide: @BotFather → /newbot → copy token → paste here.
- Bot Token (telegramBotToken) — password-masked with reveal.
- Webhook URL (read-only, auto-derived): {agentUrl}/webhook/telegram + copy.

### Slide 2: Test & Register Webhook
- One button, two live steps: getMe (verifies the token — shows @username)
  then setWebhook (points the bot at the agent). Status states: verifying →
  registering → success/error with Telegram's own error text.

### Telegram checks (Finish & Verify)
1. **Bot token present** — slide 1; empty = optional node unused.
2. **Bot token valid (live getMe)** — real Telegram API call; shows the bot's
   @username on success, Telegram's rejection reason on failure.
3. **Webhook registered to this agent (live)** — getWebhookInfo compares the
   registered URL against {agentUrl}/webhook/telegram; flags different-target
   or unregistered webhooks (fix: slide 2's Test & Register).
- Remember: the token must also be DEPLOYED (TELEGRAM_BOT_TOKEN secret —
  Agent Cloud Mirror → Deploy) for messages to reach the agent.

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
