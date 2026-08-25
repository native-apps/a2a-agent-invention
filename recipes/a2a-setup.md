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
| 6 | **JWT Auth** | Live in Wizard 2 (2 slides, incl. Finish & Verify) — OPTIONAL: verify logged-in website users |
| 7 | **License Keys** | Live in Wizard 2 (2 slides, incl. Finish & Verify) — OPTIONAL: license-key resolution for product sites |
| 8+ | advanced | Everything lives in Wizard 2 — the legacy screens were removed in v1.2.157 |

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
| JWT Auth | Identity complete AND the A2A endpoint set in Deploy to Website (OPTIONAL node) |
| License Keys | Identity complete AND the A2A endpoint set in Deploy to Website (OPTIONAL node) |

Future nodes follow the same pattern — tell the user which node unlocks next
and what it needs.

## The AI Assistant — field editing (Agent Identity, per-slide)

The assistant can FILL IN FIELDS for the user. It proposes values; the user
accepts via one-click **Apply** buttons — the assistant never writes silently.
Rules the model must follow (enforced in its system prompt):

- ONE SLIDE AT A TIME: only the CURRENT slide's fields are editable. Apply
  buttons for other slides' fields are hidden and rejected on apply.
- Emit [[SET:field=value]] on its own line; tags are stripped from the
  visible reply.
- Selects must use a listed option ID (the prompt lists valid bot user IDs,
  aiModel values, embedding providers, and project IDs when relevant).
- On Agent Skills, adding a whole skill uses
  [[ADD_SKILL:{"name":…,"description":…,"tags":[…],"examples":[…]}]].
- NEVER suggests: secrets (access/embedding/API keys — guide to the
  Fetch/Rotate buttons), the locked primary project, or the Agent Name
  (automatic from the Sub-Agent). Access Token and Finish & Verify slides
  have no editable fields.

Per-slide editable fields (Agent Identity):
| Slide | Editable fields |
|-------|----------------|
| Choose the Bot User | botUserId (applies via the full auto-populate flow) |
| Describe Your Agent | agentDescription |
| Organization / Provider | agentProvider |
| Access Token | — (Rotate Token only) |
| AI Model | aiModel (listed options only) |
| Response Settings | cfMaxTokens (128–8192), cfTemperature (0–2) |
| Vectorization | embeddingProvider, embeddingModel, embeddingDimensions |
| Agent Skills | ADD_SKILL (whole skill) |
| Project Access | additionalProjectIds (comma-separated IDs) |
| Agent Card & Review | agentUrl |
| Finish & Verify | — (diagnostics) |

(Other nodes: field editing rolls out per node next; until then the
assistant answers questions only on those nodes.)

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
### Slide 8: Agent Skills — the collapsible-card editor: each skill
is a collapsible card (▶/▼ click to expand/collapse; collapsed shows the id
badge + name + description preview). Drag a skill's header to reorder, or
use the ▲/▼ arrows. Expanded fields: ID, Name, Description, Tags,
Examples, Input/Output Modes. Remove = ✕ on the header. AI Suggest Skills
(local LLM) drafts skills for the user to pick. Skills publish to the Agent
Card and deploy as AGENT_SKILLS_JSON.
### Slide 9: Project Access — Primary Knowledge Base Project: LOCKED to the
current project (the A2A Agent is project-specific — this prevented a real
cross-project corruption bug). Additional Context Projects (Brainstorm Mode):
optional extra projects the agent may read for context; the list expands to
its full height (no inner scroll cap).
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

### Slide 1: Create Your Bot (with How Telegram Works below)
- @BotFather steps (1. message @BotFather — link — 2. /newbot, 3. copy the
  token, 4. paste below) + Bot Token field (password-masked with reveal;
  deployed as TELEGRAM_BOT_TOKEN) + configured status dot.
- Below (merged): How Telegram Works — the agent appears as a DM-able bot;
  messages hit /webhook/telegram with full MCP tool access, same knowledge
  base and chat database; text-only for security; requirements = bot token
  (2 min, free) + the A2A endpoint on a public HTTPS domain (custom domain
  required for webhook channels).
### Slide 2: Register the Webhook
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
- The final slide is titled "You're live on Telegram 🎉" — after the checks
  pass, tell the user to open Telegram, search the bot's @username, and send
  a message (same brain as the website chat).

## Step 6 — JWT Auth (OPTIONAL — session-token verification for login sites)

Mirrors Settings → Session Token Verification exactly (same storage:
jwtSecret; same deploy secret: JWT_SECRET). For websites with a log-in
system: the chat widget sends JWT session tokens; the deployed Worker
verifies them (HMAC-SHA256, shared JwtSecret) and links chats to logged-in
accounts. When UNSET: JWT-bearing requests get 503 (fail-closed) — license
and anonymous paths unaffected. If a user's site has no logins, empty is
correct. Expected claims: sub = customer/account ID, vid = visitor_id.
NOTE (roadmap): not all websites use the same JWT system — future feature:
login detection so the agent distinguishes public visitors from logged-in
users generically.

### Slide 1: Session Token Verification — JWT Secret (password-masked,
64-char base64url from Encore; leave empty = fail-closed) + status dot.

### JWT Auth checks (Finish & Verify)
1. **JWT secret present** — empty = fail-closed (fine without logins).
2. **JWT secret strength** — ≥32 chars recommended (full 64-char JwtSecret).
3. **A2A endpoint set** — the deployed Worker is what verifies tokens.

## Step 7 — License Keys (OPTIONAL — license resolution for product sites)

Mirrors Settings → License Key Integration exactly (same storage:
encoreApiUrl / encoreApiKey; same deploy secrets: ENCORE_API_URL /
ENCORE_API_KEY). For websites selling products: resolves a visitor's license
key to a visitor_id via their Subscriptions API — links in-app support chats
with web chat history (like Mother Brain's own in-app support). When unset,
keys fall back to the literal license:{key} ID.

### Slide 1: License Key Integration — Encore API URL + Encore API Key
(optional — leave empty if the endpoint is public) + status dot.

### License Keys checks (Finish & Verify)
1. **Encore API URL set (valid URL)** — empty = optional node unused.
2. **Encore API key** — needed only when the endpoint is private.
3. **A2A endpoint set** — the deployed Worker performs the lookups.

## Step 8 — NEAR Neighbors (OPTIONAL — join the onchain agent network)

UNLOCKED by: Agent Identity complete + A2A endpoint set (same as the other optional nodes). Canvas: 7th satellite (left side, network icon). The agent's public /neighbor door and knock tools (neighbors_search / neighbors_knock) ship automatically with every deployment (v1.2.159+) — this node activates the feature and registers the agent ONCHAIN.

Registry: the `neighborly` NEAR smart contract (neighborly.testnet during the testnet phase; mainnet neighborly.near at graduation). Protocol over platform: free public reads, signer-scoped writes, storage-stake deposit (0.01 Ⓝ, refunded on unregister), zero admin powers. Contract source: near-contract/ in the repo (public, verifiable).

### Slide 1: The Neighbors Network
- Explainer: agents discover and "knock" on each other over the A2A protocol; the registry lives onchain.
- Field: **neighborsEnabled** (checkbox) — records activation intent.

### Slide 2: Public Profile (the registry-only fields)
- **neighborTags** — comma-separated, up to 8 ("ai, devtools, saas").
- **neighborCategory** — select: startup | freelancer | business.
- **neighborCapabilities** — comma-separated, up to 8 ("ai-memory, website-builder") — powers "I need an app for X" matching.
- **neighborPartnerNote** — up to 200 chars, how businesses can partner with you.
- Public name/description mirror the agent identity (set those in Step 1).

### Slide 3: Join the Onchain Registry (the deliverables finale)
1. **Copy Registration Command** — generates the exact verified near-cli command from the profile fields (register call, 0.01 Ⓝ deposit, sign-as their NEAR account). Prereqs shown on-slide: a NEAR testnet account in any wallet (Meteor recommended; MyNearWallet sunsets Oct 2026).
2. **Copy /neighbors Page Prompt** — the AI-coder prompt for building a public neighbors listing page on their website (free RPC reads; full guide: docs/NEIGHBORS-WEBSITE-INTEGRATION.md).
3. **Connect NEAR Wallet panel (no terminal)** — a NEAR wallet is required for the registry (the onchain entry is owned by the wallet's account). The scoped-access-key path: ① Generate Neighbor Key (ed25519 keypair created in-app; Web Crypto, needs macOS 14+/Safari 17+ — the message suggests the CLI path otherwise); ② pick a wallet (Meteor default / MyNearWallet testnet legacy / HERE) and copy the wallet login link — open it in ANY browser (phone works), approve “Add access key”; ③ Verify Connection (live RPC access_key_list — checks the key landed on their account); ④ Register Onchain — the wizard signs the register/update transaction itself (auto-detects which via get_agent; register costs 0.01 Ⓝ refundable, update is free) and submits via FastNEAR. The key is stored in settings (neighborKeyPublic/neighborKeySecret) and is scoped to register/update/heartbeat on the Neighbors registry only — it can never move funds. Same key later powers the worker heartbeat (future phase). Settings: neighborWalletUrl holds the chosen wallet preset's login URL. NOTE: this is NEAR's native wallet login (requestSignIn URL standard) — NOT walletconnect.com (the cross-chain EVM pairing protocol; unrelated). GOTCHAS (caught live 2026-08-25): (a) the wallet must be signed in as the SAME account as the wizard's nearAccountId — approving while logged in as a different account adds the key THERE (it landed on neighborly.testnet instead of anakimota.testnet); (b) legacy MyNearWallet can grant FULL ACCESS despite the scoped link (its authorize screen is user-toggleable) — the wizard's Verify/Sign steps now check the onchain permission type and refuse over-permissioned keys with removal instructions; (c) approve keeping the LIMITED access option only.
- Field: **nearAccountId** — the account that signs (CLI or NEAR wallet connect); powers the onchain verification.

### Neighbors checks (Finish & Verify)
1. **Neighbors activated** — the slide-1 toggle.
2. **Public profile complete** — at least one tag + one capability.
3. **NEAR account set** — valid .testnet/.near format.
4. **Neighbor card served** (live GET {agentUrl}/neighbor → protocol neighbors/0.1).
5. **Registry entry found onchain** (live FastNEAR RPC get_agent → name/domain/status).
6. **Self-knock round-trip** (live POST {agentUrl}/neighbor skill site-intro → ok:true).

Remedies: card/knock failures → redeploy the agent (needs v1.2.159+); onchain miss → register via the Connect NEAR Wallet panel (steps ①–④) or the copied CLI command with a funded account, then re-run Finish. Registration runbook with exact commands + gotchas: docs/Neighbors-Feature-Plan.md § Registration Runbook.

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
