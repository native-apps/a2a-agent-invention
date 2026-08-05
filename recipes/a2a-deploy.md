# Recipe: A2A Agent Deploy (Endpoint / Website)

## Minimum Requirements

| Requirement | Needed? | Notes |
|-------------|---------|-------|
| Website | ❌ | Not required for the endpoint — only for the chat widget UI |
| Custom domain | ❌ | Free `*.workers.dev` URL works |
| Cloudflare Account ID | ✅ | Cloudflare Dashboard → Workers & Pages |
| Cloudflare API Token | ✅ | "Edit Cloudflare Workers" template (Workers Scripts:Edit) |
| Worker name | ✅ | Unique in your Cloudflare account |
| Supabase chat DB | ⚠️ | Needed once deployed (Worker can't reach local PG) — add before deploying |

**Bottom line:** A Cloudflare account is all you need for a public 24/7 endpoint. No website, no domain.

## Trigger
- "deploy a2a agent"
- "deploy my agent"
- "deploy to cloudflare"
- "hero search deploy"
- "deploy hero search"
- "/mother a2a deploy"

## Prerequisites Check
- Is the A2A Agent invention installed?
- Is the local database running?
- Are Cloudflare credentials configured?
- Is a **Cloudflare API Token** created with the correct permissions?
- Is the Hero Search integration configured?

## Required Cloudflare Credentials

The A2A Agent needs **three** Cloudflare credentials to deploy to Workers:

| Field | Setting Key | Required | How to Get It |
|-------|-------------|----------|---------------|
| **Cloudflare Account ID** | `cloudflareAccountId` | ✅ YES | Cloudflare Dashboard → Workers & Pages → copy Account ID from the right sidebar |
| **Cloudflare API Token** | `cfApiToken` | ✅ YES | Cloudflare Dashboard → My Profile → API Tokens → Create Token (see below) |
| **Worker Name** | `workerName` | ✅ YES | Pick a name (e.g., `my-a2a-agent`). Must be unique in your Cloudflare account |

### Creating the Cloudflare API Token

Use the **"Edit Cloudflare Workers"** template:

1. Go to Cloudflare Dashboard → My Profile → API Tokens → Create Token
2. Select **"Edit Cloudflare Workers"** template
3. Select your account under Account Resources
4. Click **Continue to Summary**, then **Create Token**
5. **Copy the token immediately** — you won't see it again

The **"Edit Cloudflare Workers"** template includes these permissions by default:

| Permission | Purpose |
|-----------|---------|
| `Workers Scripts:Edit` | Deploy Worker code AND manage secrets |
| `Workers KV Storage:Edit` | Read/write Workers KV data |
| `Account:Account Settings:Read` | Verify account information |

> `Workers Scripts:Edit` covers everything — deploying code AND setting secrets. No additional permissions are needed.

## Steps

### Step 1: Verify Configuration
**Check:** All required settings are filled:
  - Agent name ✓
  - Bot user email ✓
  - Cloudflare Account ID ✓
  - Cloudflare API Token ✓ ("Edit Cloudflare Workers" template — Workers Scripts:Edit)
  - Worker name ✓
  - MCP Gateway URL ✓
  - MCP Gateway Token ✓
  - Supabase URL ✓
  - Supabase Service Key ✓
  - Voyage API Key ✓
**If missing:** Prompt for each missing field

### Step 2: Deploy Secrets Are Configured

The deploy button pushes the following Worker env vars from your settings.
**Secrets** are encrypted. **Vars** are plaintext (set in wrangler.toml).

#### Secrets (19 — pushed via Cloudflare API from your settings):

| Worker Env Var | Your Settings Field | Purpose |
|---------------|-------------------|---------|
| `VOYAGE_API_KEY` | `embeddingApiKey` | Vector embeddings for Total Recall |
| `MB_SUPABASE_URL` | `mbSupabaseUrl` | Offline fallback — project Supabase URL (auto-loaded) |
| `MB_SUPABASE_SERVICE_KEY` | `mbSupabaseServiceKey` | Offline fallback — project service key (auto-fetched) |
| `MB_PROJECT_ID` | `mbProjectId` | Offline fallback — project ID (auto-loaded) |
| `MOTHER_BRAIN_GATEWAY_TOKEN` | `gatewayToken` | Gateway bearer token |
| `GATEWAY_BASE_URL` | `gatewayBaseUrl` | Gateway Worker URL |
| `AGENT_NAME` | `agentName` | Agent display name |
| `AGENT_DESCRIPTION` | `agentDescription` | Agent description |
| `AGENT_URL` | `agentUrl` | Agent endpoint URL |
| `AGENT_SKILLS_JSON` | `agentSkillsJson` | Custom skills JSON |
| `AGENT_PROVIDER` | `agentProvider` | Organization name |
| `MOTHER_BRAIN_USER_TOKEN` | `accessToken` | Sub-Agent Zero Trust token |
| `MCP_BASE_URL` | `mcpBaseUrl` | Website MCP server URL |
| `MCP_API_KEY` | `mcpApiKey` | Website MCP API key |
| `WEBSITE_URL` | `websiteUrl` | Website URL for link absolutization |
| `ENCORE_API_URL` | `encoreApiUrl` | License key resolution API URL |
| `ENCORE_API_KEY` | `encoreApiKey` | License key resolution API key |
| `JWT_SECRET` | `jwtSecret` | Session token verification |
| `TELEGRAM_BOT_TOKEN` | `telegramBotToken` | Telegram bot integration |

#### Vars (3 — set in wrangler.toml, NOT pushed as secrets):

| Worker Env Var | Value | Purpose |
|---------------|-------|---------|
| `ENVIRONMENT` | `"production"` | Runtime environment |
| `AI_MODEL` | `"default"` | LLM model (routes to user's MB App Settings) |
| `CF_WORKER_MODEL` | `"@cf/zai-org/glm-4.7-flash"` | Workers AI fallback model |
| `FORCE_CF_WORKER` | `"false"` | When true, bypasses Gateway for Workers AI only |

> **Offline Fallback:** When the MCP Gateway is unreachable, the Worker queries the project's Supabase directly using the `MB_*` secrets. All 3 auto-load from the primary project — no manual entry required.

### Step 3: Deploy
**Action:** The Settings UI does three things in order:
1. **Pre-save** — Saves all settings to the server with an awaited PATCH call
2. **Push secrets** — Pushes all 19 non-empty secrets via direct Cloudflare API (using your API Token)
3. **Deploy code** — Calls `POST /api/inventions/a2a-agent/action/deploy` (deploys Worker code via wrangler)

**Message:** "Deploying to Cloudflare... This may take up to 2 minutes."
**Show:** Loading spinner + progress

### Step 4: Verify Deployment
**Action:** Test the endpoint with a message/send request
**curl:**
```bash
curl -X POST {agentUrl}/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "message/send",
    "params": {
      "message": {
        "role": "user",
        "parts": [{"type": "text", "text": "Hello!"}]
      },
      "metadata": {"source": "deployment-test"}
    },
    "id": 1
  }'
```
**Expected:** Response has `result.task.status` of `"completed"` and `result.task.history` containing the agent's response.

### Step 5: Update Endpoint URL
**Action:** Set `agentUrl` to the deployed worker URL
**Action:** Set `deployStatus` to "deployed"

### Step 6: Verify Secrets in Cloudflare Dashboard
**Action:** Go to Cloudflare Dashboard → Workers & Pages → {worker-name} → Settings → Variables and Secrets
**Verify:**
- All required secrets are present (SUPABASE_URL, SUPABASE_SERVICE_KEY, MOTHER_BRAIN_GATEWAY_TOKEN, etc.)
- All vars are present (ENVIRONMENT, AI_MODEL, CF_WORKER_MODEL, FORCE_CF_WORKER)
- No "Binding name already in use" errors

### Step 7: Test Hero Search
**Action:** Verify the Hero Search pattern works on the target website
1. Navigate to the target website
2. Type a query into any search input
3. Press **ENTER** — an AI conversation should start
**Expected:** The search input triggers the A2A agent conversation flow

## Completion
✅ **Deployed!** Your A2A endpoint is live at `{workerUrl}`.
🔗 Agent Card: `{workerUrl}/.well-known/agent-card.json`
🔍 **Hero Search:** Users can now search on your website and press ENTER to start an AI conversation.

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Deploy succeeds but Worker doesn't respond | Secrets not pushed | Check Cloudflare Dashboard → Worker → Variables. Use the "Check Now" button in Settings, or re-deploy |
| "Binding name already in use" error | A secret conflicts with a [vars] entry | This affects AI_MODEL, CF_WORKER_MODEL, FORCE_CF_WORKER — the deploy handler skips these. Ignore the error |
| Secrets not pushed | API Token missing Workers Scripts:Edit | The "Edit Cloudflare Workers" template includes Workers Scripts:Edit which covers secrets. Re-create with the correct template or push manually via `wrangler secret put` |
| Gateway errors | MOTHER_BRAIN_GATEWAY_TOKEN missing or invalid | Check the token value in Settings → MCP Gateway Token |
| Telegram webhook returns 503 | TELEGRAM_BOT_TOKEN not set as secret | Check Cloudflare Dashboard → Worker → Variables. Set it manually: `wrangler secret put TELEGRAM_BOT_TOKEN` |
