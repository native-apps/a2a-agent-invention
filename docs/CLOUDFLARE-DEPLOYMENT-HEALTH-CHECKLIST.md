# ☁️ Cloudflare Deployment — 1000% Health Checklist

**Purpose:** Every single detail that must be correct for the A2A Agent to deploy perfectly to Cloudflare Workers from the Mother Brain Inventions Settings screen. Nothing is too small to check.

**Audience:** Mother Brain users installing the A2A Agent invention. They never touch an IDE — everything happens in the Settings UI.

**Last Updated:** July 24, 2026

---

## ── PHASE 0: Prerequisites ──

Before attempting any deployment, the user must have:

- [x] **Mother Brain App** installed and running
- [x] **A2A Agent invention** installed via Inventions → Labs → A2A Agent
- [ ] **Local database** started (Settings → Database → Start)
- [x] **Supabase account** (optional but recommended for cloud sync)
- [x] **Cloudflare account** with Workers enabled
- [ ] **Cloudflare Workers API Token** with `Workers:Secrets` permission
  - [x] Verify which API Key is the one for the A2A Agent. We have two or more. One is already in the Mother Brain App global settings. But, can we use that same one? Or, we need a dedicated one for the A2A?
    - [ ] We need to document all of the persmissions exactly perfectly that users will need to set. And, is it possible for Cloudflared or Wrangler CLI to create these automatically if there is already a Cloduflare Account API Key that has full permissions? If yes, we should do this and list which permissions it needs. If not, then we need to automate this as much as possible.


## UPDATE THE RECIPE'S FOR THE A2A AGENT INVENTION:

- This is supposed to allow the user's to chat with `/mother` or their Chat LLM, and it should guide them step by step through the setups, and have full internal control over the A2A Agent Invention settings. So, users can chat and `/mother` will populate and set all the fields for them.

---

## ── PHASE 1: Settings UI Fields ──

Every field in the Settings screen that affects deployment. The user fills these in via the UI — they never edit JSON directly.

### 1A. Cloudflare Credentials (Deploy Section)

| # | Field | Setting Key | Required? | Description |
|---|-------|-------------|-----------|-------------|
| 1 | **Cloudflare Account ID** | `cloudflareAccountId` | ✅ YES | Found in Cloudflare Dashboard → Workers & Pages → Account ID |
| 2 | **Cloudflare API Token** | `cfApiToken` | ✅ YES | Cloudflare Dashboard → My Profile → API Tokens. Must have `Workers:Secrets` permission |
| 3 | **Worker Name** | `workerName` | ✅ YES | Name of the Cloudflare Worker (default: `a2a-endpoint`). Must be unique in your Cloudflare account |

**WARNING:** Without ALL THREE of these fields, deployment will fail. The API token is required — the Mother Brain app does NOT have its own Cloudflare token. The user provides theirs.

### 1B. Endpoint Configuration

| # | Field | Setting Key | Required? | Description |
|---|-------|-------------|-----------|-------------|
| 4 | **MCP Gateway URL** | `gatewayBaseUrl` | ✅ YES | Your Mother Brain project's Gateway Worker URL |
| 5 | **MCP Gateway Token** | `gatewayToken` | ✅ YES | Bearer token for the Gateway (master/project API key) |
| 6 | **Access Token** | `accessToken` | ❌ Optional | Sub-Agent access token for Zero Trust attribution |
| 7 | **Endpoint URL** | `agentUrl` | ❌ Optional | Auto-filled from the deployed Worker URL after deploy |

### 1C. Database Configuration

| # | Field | Setting Key | Required? | Description |
|---|-------|-------------|-----------|-------------|
| 8 | **Database Provider** | `dbProvider` | ✅ YES | "Both" or "Supabase Only". Stores visitor chat history |
| 9 | **Supabase URL** | `supabaseUrl` | ✅ YES | Your Supabase project URL (if using Supabase) |
| 10 | **Supabase Service Key** | `supabaseServiceKey` | ✅ YES | `service_role` key from Supabase Project Settings → API |

### 1D. AI & Embedding Configuration

| # | Field | Setting Key | Required? | Description |
|---|-------|-------------|-----------|-------------|
| 11 | **AI Model** | `aiModel` | ❌ Optional | LLM model ID. "default" uses the user's configured model |
| 12 | **Voyage API Key** | `embeddingApiKey` | ✅ YES | For vector embeddings (Total Recall / knowledge search) |
| 13 | **Embedding Model** | `embeddingModel` | ❌ Optional | Voyage embedding model (default: `voyage-4-large`) |
| 14 | **Cloudflare Worker Model** | `cfWorkerModel` | ❌ Optional | Workers AI fallback model. Deployed as `CF_WORKER_MODEL` var |
| 15 | **Force Cloudflare Worker** | `forceCfWorker` | ❌ Optional | When checked, bypasses Gateway and uses Workers AI only |

### 1E. Agent Identity

| # | Field | Setting Key | Required? | Description |
|---|-------|-------------|-----------|-------------|
| 16 | **Agent Name** | `agentName` | ❌ Optional | Display name for the agent |
| 17 | **Agent Description** | `agentDescription` | ❌ Optional | Short description of the agent |
| 18 | **Agent URL** | `agentUrl` | ❌ Optional | Public URL of the agent endpoint |
| 19 | **Agent Provider** | `agentProvider` | ❌ Optional | Organization name (e.g., "Native Apps Dev") |
| 20 | **Agent Skills JSON** | `agentSkillsJson` | ❌ Optional | JSON string of custom skills |

### 1F. Optional Features (Graceful Degradation)

| # | Field | Setting Key | Required? | Description |
|---|-------|-------------|-----------|-------------|
| 21 | **JWT Secret** | `jwtSecret` | ❌ Optional | For website session token verification. Fail-closed when unset |
| 22 | **Telegram Bot Token** | `telegramBotToken` | ❌ Optional | For Telegram bot integration. 503 when unset |
| 23 | **Website URL** | `websiteUrl` | ❌ Optional | For link absolutization in AI responses |
| 24 | **MCP Base URL** | `mcpBaseUrl` | ❌ Optional | For website MCP tools (read_page, navigate, etc.) |
| 25 | **MCP API Key** | `mcpApiKey` | ❌ Optional | API key for website MCP tools |
| 26 | **Encore API URL** | `encoreApiUrl` | ❌ Optional | For license key resolution (in-app support) |
| 27 | **Encore API Key** | `encoreApiKey` | ❌ Optional | API key for license lookup |

---

## ── PHASE 2: config.json Deploy Action ──

The file `config.json` at the root of the invention defines the deploy action. The Mother Brain app reads this file to know HOW to deploy.

### 2A. Action Structure

```json
"actions": {
  "deploy": {
    "type": "cloudflare-deploy",    // Tells MB app: "this is a Cloudflare Worker deploy"
    "sourceDir": "backend/",        // Which directory contains the Worker source code
    "secrets": { ... }             // Maps Settings fields → Worker environment variables
  }
}
```

- [ ] `type` is exactly `"cloudflare-deploy"` (not misspelled, not null)
- [ ] `sourceDir` is exactly `"backend/"` (no trailing slash issues, no missing directory)
- [ ] `secrets` object maps ALL settings fields that need to be Worker env vars

### 2B. Secrets Mapping (config.json → Worker)

Each entry maps: `"WORKER_ENV_VAR_NAME": "settingsFieldName"`

| Worker Env Var | Settings Field | Type | Notes |
|----------------|---------------|------|-------|
| `VOYAGE_API_KEY` | `embeddingApiKey` | Secret | Required for embeddings |
| `MB_SUPABASE_URL` | `mbSupabaseUrl` | Secret | Auto-populated from project config |
| `MB_SUPABASE_SERVICE_KEY` | `mbSupabaseServiceKey` | Secret | Auto-fetched via Supabase Management API |
| `MB_PROJECT_ID` | `mbProjectId` | Secret | Auto-populated from active project |
| `MOTHER_BRAIN_GATEWAY_TOKEN` | `gatewayToken` | Secret | Required for Gateway access |
| `GATEWAY_BASE_URL` | `gatewayBaseUrl` | Secret | Required for Gateway URL |
| `AGENT_NAME` | `agentName` | Secret | Optional identity override |
| `AGENT_DESCRIPTION` | `agentDescription` | Secret | Optional identity override |
| `AGENT_URL` | `agentUrl` | Secret | Optional URL override |
| `AGENT_SKILLS_JSON` | `agentSkillsJson` | Secret | Optional skills override |
| `AGENT_PROVIDER` | `agentProvider` | Secret | Optional provider override |
| `MOTHER_BRAIN_USER_TOKEN` | `accessToken` | Secret | Optional Zero Trust attribution |
| `MCP_BASE_URL` | `mcpBaseUrl` | Secret | Optional website MCP server |
| `MCP_API_KEY` | `mcpApiKey` | Secret | Optional website MCP auth |
| `WEBSITE_URL` | `websiteUrl` | Secret | Optional link absolutization |
| `ENCORE_API_URL` | `encoreApiUrl` | Secret | Optional license resolution |
| `ENCORE_API_KEY` | `encoreApiKey` | Secret | Optional license lookup auth |
| `JWT_SECRET` | `jwtSecret` | Secret | Optional session token verification |
| `TELEGRAM_BOT_TOKEN` | `telegramBotToken` | Secret | Optional Telegram bot |
| `AI_MODEL` | `aiModel` | **VAR** (wrangler.toml) | NOT pushed as secret — set in `[vars]` |
| `CF_WORKER_MODEL` | `cfWorkerModel` | **VAR** (wrangler.toml) | NOT pushed as secret — set in `[vars]` |
| `FORCE_CF_WORKER` | `forceCfWorker` | **VAR** (wrangler.toml) | NOT pushed as secret — set in `[vars]` |

**⚠️ CRITICAL RULE:** `AI_MODEL`, `CF_WORKER_MODEL`, and `FORCE_CF_WORKER` are in BOTH config.json secrets AND wrangler.toml [vars]. 
- The [vars] values in wrangler.toml are what actually get deployed
- The secrets mapping entries exist in config.json but the deploy handler's direct Cloudflare API call skips them to avoid "Binding name already in use" errors
- If these need to change, edit wrangler.toml directly

---

## ── PHASE 3: wrangler.toml Configuration ──

The file `backend/wrangler.toml` defines the Cloudflare Worker configuration that is deployed.

### 3A. Required Fields

- [ ] `name` — The Worker name (defaults to `motherbrain-a2a-endpoint`). Overridden by `workerName` setting at deploy time.
- [ ] `main` — Entry point file: `"src/index.ts"`
- [ ] `compatibility_date` — Must be `"2026-05-01"` or later

### 3B. [vars] Section

```toml
[vars]
ENVIRONMENT = "production"
AI_MODEL = "default"
CF_WORKER_MODEL = "@cf/zai-org/glm-4.7-flash"
FORCE_CF_WORKER = "false"
```

- [ ] `ENVIRONMENT` set to `"production"`
- [ ] `AI_MODEL` set to `"default"` (routes to user's active LLM in MB App Settings)
- [ ] `CF_WORKER_MODEL` set to `"@cf/zai-org/glm-4.7-flash"` (Workers AI fallback model)
- [ ] `FORCE_CF_WORKER` set to `"false"` (uses Gateway by default)
- [ ] ❌ NO secrets in [vars] (no API keys, no tokens)
- [ ] ❌ NO `TELEGRAM_BOT_TOKEN` in [vars] (it's a secret, not a var)
- [ ] ❌ NO `SUPABASE_URL` in [vars] (it's a secret, not a var)

### 3C. [ai] Binding

```toml
[ai]
binding = "AI"
```

- [ ] `[ai]` section present
- [ ] `binding` set to `"AI"`
- [ ] This enables `env.AI` in the Worker for Workers AI fallback

---

## ── PHASE 4: Deploy Handler Code Flow ──

When the user clicks **"Redeploy to Cloudflare"** in the Settings UI, this is the EXACT sequence of events that must happen, in order.

### 4A. Pre-Deploy Save

- [ ] Fetch project config from `/api/projects/{activePid}/config`
- [ ] Extract `supabaseUrl` and `supabaseAccessToken` from project config
- [ ] If supabaseAccessToken is present, fetch `service_role` key from Supabase Management API
- [ ] Merge all settings into a `fullSave` object
- [ ] Call `saveToServer(fullSave)` for backward compat
- [ ] Call `PATCH /api/inventions/{id}` with full settings — **awaited, not fire-and-forget**
- [ ] Verify the PATCH response is OK (log warning if not)

### 4B. Direct Cloudflare API — Push Secrets

- [ ] Check that `cfApiToken`, `cloudflareAccountId`, and `workerName` are all non-empty
- [ ] If any are empty → skip secrets push (secrets won't be pushed via direct API)
- [ ] For each secret in SECRETS_MAP (19 entries):
  - [ ] Skip if settings field value is empty
  - [ ] Skip if secret name conflicts with a wrangler.toml [vars] entry (AI_MODEL, CF_WORKER_MODEL, FORCE_CF_WORKER)
  - [ ] Call `PUT https://api.cloudflare.com/client/v4/accounts/{accountId}/workers/scripts/{workerName}/secrets`
  - [ ] Header: `Authorization: Bearer {cfApiToken}`
  - [ ] Body: `{ "name": "...", "text": "...", "type": "secret_text" }`
  - [ ] Check response `success` field
  - [ ] If success → increment `secretsPushed`
  - [ ] If failure → increment `secretsFailed`, log warning
  - [ ] On network error → increment `secretsFailed`, log error
- [ ] Log summary: `"Secrets pushed: X succeeded, Y failed"`

### 4C. MB App Deploy Action

- [ ] Call `POST /api/inventions/a2a-agent/action/deploy{?projectId=...}`
- [ ] If HTTP 200:
  - [ ] Parse response JSON for `status` field
  - [ ] Set `deployStatus` to response status or `"deployed"`
  - [ ] Set `lastDeployedAt` to current timestamp
  - [ ] Schedule health check after 2 seconds
- [ ] If NOT HTTP 200:
  - [ ] Try to parse error message from response body
  - [ ] Set `deployError` with the error message

### 4D. Error Handling

- [ ] If any part of the handler throws:
  - [ ] Catch the error
  - [ ] Set `deployError` to the error message or "Network error during deploy"
- [ ] In the `finally` block:
  - [ ] Set `isDeploying` to `false`

---

## ── PHASE 5: Cloudflare API Token Permissions ──

The `cfApiToken` the user provides MUST have the correct Cloudflare API permissions.

### 5A. Required Permissions

The **"Edit Cloudflare Workers"** template includes all needed permissions by default:

| Permission | Purpose |
|-----------|---------|
| `Workers Scripts:Edit` | Deploy Worker code AND manage secrets (covers everything) |
| `Workers KV Storage:Edit` | Read/write Workers KV data |
| `Account:Account Settings:Read` | Verify account information |

> `Workers Scripts:Edit` is the key permission. It covers both `wrangler deploy` (code) and `wrangler secret put` (secrets). No additional permissions are needed.

### 5B. Creating the Token (User Instructions)

Go to Cloudflare Dashboard → My Profile → API Tokens → Create Token → "Edit Cloudflare Workers" template:

1. **Token name:** `A2A Agent Deploy`
2. **Permissions:** The template auto-selects the correct permissions
3. **Account Resources:** Include your account
4. **Zone Resources:** None needed
5. **TTL:** Optional (set to never expire, or extend as needed)

### 5C. Troubleshooting Token Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| Deploy fails with 403 | Token lacks Workers Scripts:Edit | Re-create token with "Edit Cloudflare Workers" template |
| Secrets not pushed | Token lacks proper permissions | The "Edit Cloudflare Workers" template includes Workers Scripts:Edit which covers secrets. Re-create with the correct template. |
| "Binding name already in use" | Var and secret share a name | These 3 env vars (AI_MODEL, CF_WORKER_MODEL, FORCE_CF_WORKER) are in wrangler.toml [vars] — the deploy handler skips them automatically |
| Deploy succeeds but Worker doesn't respond | Missing SUPABASE_URL or other required secrets | Check Cloudflare Dashboard → Worker → Variables → all secrets are set |

---

## ── PHASE 6: Post-Deployment Verification ──

These checks MUST be done after every deployment to confirm the Worker is healthy.

### 6A. Endpoint Health

- [ ] `GET https://{worker-url}/` returns `200` with `{ service: "A2A Endpoint", status: "operational" }`
- [ ] `GET https://{worker-url}/.well-known/agent-card.json` returns `200` with valid agent card
- [ ] `POST https://{worker-url}/` with `{ jsonrpc: "2.0", method: "agent/getCard", id: 1 }` returns valid JSON-RPC response

### 6B. Secret Verification (Cloudflare Dashboard)

- [ ] Go to Cloudflare Dashboard → Workers & Pages → {worker-name} → Settings → Variables and Secrets
- [ ] Verify ALL required secrets are present:
  - [ ] `SUPABASE_URL` — has value
  - [ ] `SUPABASE_SERVICE_KEY` — has value
  - [ ] `MOTHER_BRAIN_GATEWAY_TOKEN` — has value
  - [ ] `GATEWAY_BASE_URL` — has value
  - [ ] `VOYAGE_API_KEY` — has value
- [ ] Verify optional secrets are present if configured:
  - [ ] `TELEGRAM_BOT_TOKEN` — has value (if Telegram is configured)
  - [ ] `JWT_SECRET` — has value (if JWT auth is configured)
  - [ ] `MB_SUPABASE_URL` — has value (if offline fallback is configured)
  - [ ] `MB_SUPABASE_SERVICE_KEY` — has value (if offline fallback is configured)
  - [ ] `MB_PROJECT_ID` — has value (if offline fallback is configured)
  - [ ] `AGENT_NAME` — has value (if custom identity is configured)
  - [ ] `AGENT_DESCRIPTION` — has value (if custom identity is configured)
  - [ ] `AGENT_URL` — has value (if custom URL is configured)
  - [ ] `AGENT_SKILLS_JSON` — has value (if custom skills are configured)
  - [ ] `AGENT_PROVIDER` — has value (if custom provider is configured)
  - [ ] `MOTHER_BRAIN_USER_TOKEN` — has value (if Sub-Agent token is configured)
  - [ ] `MCP_BASE_URL` — has value (if website MCP is configured)
  - [ ] `MCP_API_KEY` — has value (if website MCP is configured)
  - [ ] `WEBSITE_URL` — has value (if website URL is configured)
  - [ ] `ENCORE_API_URL` — has value (if license resolution is configured)
  - [ ] `ENCORE_API_KEY` — has value (if license resolution is configured)
- [ ] Verify [vars] are present:
  - [ ] `ENVIRONMENT` = `"production"`
  - [ ] `AI_MODEL` = `"default"`
  - [ ] `CF_WORKER_MODEL` = `"@cf/zai-org/glm-4.7-flash"`
  - [ ] `FORCE_CF_WORKER` = `"false"`

### 6C. Telegram Webhook Verification (if configured)

- [ ] `GET https://{worker-url}/webhook/telegram/info` returns `{ ok: true, username: "..." }`
- [ ] Send a test message to @motherbrain_a2a_bot on Telegram → Mother responds

### 6D. AI Response Test

- [ ] Send a test message from the Mother Brain Preview screen:
  - Open the A2A Agent in Inventions
  - Go to Preview tab
  - Type a question and send
  - Verify the AI responds (may take a few seconds)
- [ ] Check that the conversation appears in the Conversations screen

---

## ── PHASE 7: Secrets Workflow (How Secrets Get to the Worker) ──

There are TWO ways secrets reach the Cloudflare Worker. Understanding both is critical.

### 7A. Method 1: Direct Cloudflare API (from Settings UI deploy handler)

**When:** User clicks "Deploy to Cloudflare" button AND has provided a `cfApiToken`

**Flow:**
```
Settings UI PATCH saves settings → Settings UI calls Cloudflare API for each non-empty secret
  → Cloudflare stores as encrypted secret_text on the Worker
  → Settings UI calls MB app deploy endpoint
  → MB app runs wrangler deploy (code only, not secrets)
  → Worker restarts with new code + secrets
```

**Pro:**
- Bypasses broken `wrangler secret put` in MB app
- Works even when MB app's CLOUDFLARE_API_TOKEN lacks Workers:Secrets permission
- Pushes ALL 19 non-empty secrets, not just TELEGRAM_BOT_TOKEN

**Con:**
- Requires the user to provide their own Cloudflare API token
- Can fail for individual secrets without blocking the deployment (graceful per-secret failure)

### 7B. Method 2: MB App Deploy Action (wrangler secret put)

**When:** User clicks "Deploy to Cloudflare" button

**Flow:**
```
Settings UI calls MB app deploy endpoint → MB app reads config.json secrets mapping
  → MB app runs wrangler deploy (pushes code + vars)
  → MB app runs wrangler secret put for each secret in mapping
  → Worker restarts with new code + vars + secrets
```

**Pro:**
- Fully automated — user doesn't need to provide a separate cfApiToken
- Uses the MB app's bundled wrangler

**Con:**
- `wrangler secret put` FAILS silently when the MB app's CLOUDFLARE_API_TOKEN lacks Workers:Secrets permission
- Secrets that conflict with [vars] cause "Binding name already in use" errors
- This is why Method 1 exists as a fallback

### 7C. Method 3: Manual CLI (emergency workaround)

**When:** Both Method 1 and Method 2 fail (e.g., no cfApiToken, MB app token lacks permissions)

**Flow:**
```bash
cd /path/to/a2a-agent-invention/backend
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_KEY
wrangler secret put MOTHER_BRAIN_GATEWAY_TOKEN
wrangler secret put TELEGRAM_BOT_TOKEN
# ... etc for each required secret
wrangler deploy
```

**Pro:**
- Always works if the user's wrangler CLI is authenticated
- Complete control over which secrets are set

**Con:**
- Requires terminal access (violates the "no IDE needed" principle)
- Must be done manually for each secret

---

## ── PHASE 8: Known Issues & Mitigations ──

### Issue 1: MB app `wrangler secret put` silently fails

**Symptom:** Deploy button runs, code deploys, but secrets aren't pushed to the Worker. The Worker starts but can't connect to Supabase or Gateway.

**Root cause:** The Mother Brain app's bundled CLOUDFLARE_API_TOKEN lacks `Workers:Secrets` permission. The deploy handler calls `wrangler secret put` which fails, but the failure is caught silently.

**Fix (Method 1 — Settings UI):** Provide a `cfApiToken` in the Settings → Deploy section. The deploy handler's direct Cloudflare API code will push all non-empty secrets before calling the MB app deploy.

**Fix (Method 2 — Manual):**
```bash
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_KEY
wrangler secret put MOTHER_BRAIN_GATEWAY_TOKEN
```

### Issue 2: "Binding name already in use"

**Symptom:** Deploy fails with error about binding name.

**Root cause:** A secret with the same name as a [vars] entry exists. Cloudflare doesn't allow both a var AND a secret with the same name.

**Known conflicts:**
- `AI_MODEL` — in both config.json secrets AND wrangler.toml [vars]
- `CF_WORKER_MODEL` — in both config.json secrets AND wrangler.toml [vars]
- `FORCE_CF_WORKER` — in both config.json secrets AND wrangler.toml [vars]

**Fix:** The Settings UI deploy handler's direct Cloudflare API call SKIPS these three. For the MB app deploy action, these may still fail silently.

### Issue 3: Gateway unreachable

**Symptom:** Worker deploys, health check passes, but AI responses are "offline" or "I'm having trouble connecting."

**Root cause:** The MCP Gateway (`GATEWAY_BASE_URL`) is unreachable or the `MOTHER_BRAIN_GATEWAY_TOKEN` is invalid/expired.

**Fix:** 
- Verify `GATEWAY_BASE_URL` is correct
- Verify `MOTHER_BRAIN_GATEWAY_TOKEN` is valid
- Check if the Gateway Worker is running
- The Worker falls back to Workers AI (GLM-4.7-Flash) when Gateway is down

### Issue 4: Supabase connection failure

**Symptom:** Worker starts but can't store messages. Conversations don't appear in CRM.

**Root cause:** `SUPABASE_URL` or `SUPABASE_SERVICE_KEY` are missing or incorrect.

**Fix:**
- Check Cloudflare Dashboard → Worker → Variables → verify both secrets are set
- Test Supabase connection from Settings → Database

### Issue 5: Old Worker instance still running

**Symptom:** After deploy, the old behavior persists. New code doesn't seem to take effect.

**Root cause:** Cloudflare Workers may take a few seconds to propagate. The old isolate may still be handling requests.

**Fix:**
- Wait 30 seconds
- Check `lastCfDeployedAt` in the Settings UI
- Run a health check (click "Check Now" button)

---

## ── PHASE 9: Complete User Journey ──

This is the step-by-step experience a user should have when deploying the A2A Agent.

### Step 1: Install the Invention

1. Open Mother Brain app
2. Go to Inventions → Labs
3. Find "A2A Agent" in the registry
4. Click Install
5. ✅ Invention appears in the sidebar

### Step 2: Start the Local Database

1. Navigate to A2A Agent → Settings
2. Click Start Database
3. ✅ Status shows "Running"

### Step 3: Configure Required Settings

1. **MCP Gateway Settings:**
   - Enter MCP Gateway URL
   - Enter MCP Gateway Token
   
2. **Database Settings:**
   - Enter Supabase URL
   - Enter Supabase Service Key
   - ✅ Test Connection passes

3. **Vectorization Settings:**
   - Enter Voyage API Key
   - ✅ Embedding provider shows "voyage-ai"

4. **Deploy Settings:**
   - Enter Cloudflare Account ID
   - Enter Cloudflare API Token (with Workers:Secrets permission)
   - Enter Worker Name

### Step 4: Configure Optional Features

5. **Agent Identity (optional):**
   - Enter Agent Name
   - Enter Agent Description

6. **Telegram (optional):**
   - Enter Telegram Bot Token
   - ✅ Info shows "Configured" with bot username

7. **JWT Session Token (optional):**
   - Enter JWT Secret

8. **License Key Resolution (optional):**
   - Enter Encore API URL
   - Enter Encore API Key

### Step 5: Deploy

1. Click "Deploy to Cloudflare"
2. ✅ Spinner shows "Deploying..."
3. ✅ After ~30-60 seconds: "Deployed" shown with green indicator
4. ✅ Health check runs automatically

### Step 6: Verify

1. ✅ Endpoint shows "Deployed"
2. ✅ "Worker confirmed on Cloudflare" message appears
3. Send a test message from the Preview screen
4. ✅ AI responds with the correct system prompt
5. Check the Conversations screen
6. ✅ Messages appear in the conversation list

---

## ── COMPLETE VERIFICATION CHECKLIST ──

**Run this checklist AFTER every deployment. Every item must pass.**

### Endpoint
- [ ] `GET {worker-url}/` → `status: "operational"`
- [ ] `GET {worker-url}/.well-known/agent-card.json` → valid JSON
- [ ] `POST {worker-url}/` `agent/getCard` → valid JSON-RPC

### Telegram (if configured)
- [ ] `GET {worker-url}/webhook/telegram/info` → `ok: true`
- [ ] Send DM to bot → Mother responds within 30 seconds

### Secrets (Cloudflare Dashboard)
- [ ] `SUPABASE_URL` set
- [ ] `SUPABASE_SERVICE_KEY` set
- [ ] `MOTHER_BRAIN_GATEWAY_TOKEN` set
- [ ] `GATEWAY_BASE_URL` set
- [ ] `VOYAGE_API_KEY` set
- [ ] `TELEGRAM_BOT_TOKEN` set (if configured)
- [ ] All other optional secrets set as configured

### Vars (Cloudflare Dashboard)
- [ ] `ENVIRONMENT` = `"production"`
- [ ] `AI_MODEL` = `"default"`
- [ ] `CF_WORKER_MODEL` = `"@cf/zai-org/glm-4.7-flash"`
- [ ] `FORCE_CF_WORKER` = `"false"`

### AI Pipeline
- [ ] Message/send returns a response (test from Preview)
- [ ] Response uses configured personality/name
- [ ] Conversation appears in CRM/Conversations

### Database
- [ ] New messages appear in Supabase `tasks` table
- [ ] New messages appear in Supabase `task_messages` table

### Settings UI
- [ ] `deployStatus` shows "deployed"
- [ ] `lastDeployedAt` shows recent timestamp
- [ ] "Check Now" health check returns "Deployed"
- [ ] `deployError` is empty/null
