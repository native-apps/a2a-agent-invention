# Recipe: A2A Agent Deploy

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
- Is the Hero Search integration configured?

## Steps

### Step 1: Verify Configuration
**Check:** All required settings are filled:
  - Agent name ✓
  - Bot user email ✓
  - Cloudflare Account ID ✓
  - Worker name ✓
**If missing:** Prompt for each missing field

### Step 2: Build Worker Secrets
**Prompt:** "Setting up Cloudflare Worker secrets..."
**Action:** Configure wrangler secrets:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_KEY`
  - `MOTHER_BRAIN_GATEWAY_TOKEN`

### Step 3: Deploy
**Action:** POST `/api/inventions/a2a-agent/deploy`
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
        "parts": [{"type": "text", "text": "Hello, what is Mother Brain?"}]
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

### Step 6: Test Hero Search
**Action:** Verify the Hero Search pattern works on the target website
1. Navigate to the target website
2. Type a query into any search input
3. Press **ENTER** — an AI conversation should start
**Expected:** The search input triggers the A2A agent conversation flow

## Completion
✅ **Deployed!** Your A2A endpoint is live at `{workerUrl}`.
🔗 Agent Card: `{workerUrl}/.well-known/agent.json`
🔍 **Hero Search:** Users can now search on your website and press ENTER to start an AI conversation.
