# Recipe: A2A Agent — Persistent (Always Online)

## Minimum Requirements

| Requirement | Needed? | Notes |
|-------------|---------|-------|
| Website | ❌ | Not needed at all |
| Custom domain | ❌ | Free `*.workers.dev` URL works |
| Cloudflare Worker deployed | ✅ | Keeps the endpoint reachable 24/7 on the edge |
| Supabase chat database | ✅ | Cloud storage for conversations (the Worker can't reach your local Postgres) |
| Gateway + project connected | ✅ | Routes agent requests to your knowledge base |

**Bottom line:** Persistent mode = Cloudflare (always-on) + Supabase (cloud chat DB). No website, no domain.

## Steps

### Step 1: Deploy the endpoint
Run the **Deploy to Website** flow — Cloudflare API Token (Edit Cloudflare Workers template), a Worker name, and optionally the Account ID (auto-resolved from the app's token when empty). You get a free `https://{worker}.workers.dev` URL.

### Step 2: Configure Supabase chat database
1. Create a dedicated Supabase project (or reuse one)
2. Paste the **Project URL** and **Service Role Key** into Settings → Chat Database
3. Set Database Provider to **Both (Local + Remote Sync)** or **Supabase Only**
4. Turn **Sync local → Supabase** ON

### Step 3: Verify the Worker is connected
**Check:** Gateway URL + Gateway token are set (Settings → MCP Gateway).
**Check:** `deployStatus` shows `deployed` and `lastDeployedAt` is recent.

### Step 4: Prevent Sleep (optional once deployed)
Once the Worker is deployed, your laptop doesn't need to stay awake — Cloudflare answers for you. You can leave "Prevent Sleep on Lid Close" off.

### Step 5: Verify 24/7
**Action:** Close your laptop. Send a message from a different device.
**Expected:** The agent still responds — the Cloudflare Worker handled it.

## Completion Message
✅ **Your agent is online 24/7.** Cloudflare + Supabase keep it alive even when your laptop sleeps.

## Error Handling
- **Worker not responding** → Redeploy from Settings → Deploy. Check Cloudflare Dashboard → Worker → Variables and Secrets.
- **"Binding name already in use"** → AI_MODEL / CF_WORKER_MODEL / FORCE_CF_WORKER live in `wrangler.toml` [vars], not secrets — the deploy handler skips these. Ignore the error.
- **Chat history not appearing** → Verify Supabase URL + Service Key, and that sync is ON.
