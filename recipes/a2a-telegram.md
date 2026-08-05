# Recipe: A2A Agent on Telegram

## Minimum Requirements

| Requirement | Needed? | Notes |
|-------------|---------|-------|
| Website | ❌ | Not needed at all |
| Custom domain | ❌ | The free `*.workers.dev` URL satisfies Telegram's HTTPS webhook requirement |
| Telegram bot token (@BotFather) | ✅ | 2 minutes, free — create with @BotFather |
| Cloudflare Worker deployed | ✅ | Gives you the public HTTPS endpoint Telegram calls |
| Supabase chat DB | ✅ | The deployed Worker stores chat history in Supabase (it can't reach your local Postgres) |

**Bottom line:** No website. No domain. Just a bot token + a Cloudflare deploy.

## Steps

### Step 1: Deploy your endpoint first
The Telegram webhook points at your deployed A2A endpoint. Run the **Deploy to Website** flow first — Cloudflare gives you a free `https://{worker}.workers.dev` URL. That URL is your `agentUrl`.

### Step 2: Create your bot
1. Open Telegram and message **@BotFather**
2. Send `/newbot` and follow the prompts
3. Copy the HTTP API token (format: `123456789:AA…`)

### Step 3: Enter the bot token
**Action:** Paste the token into Settings → Telegram → Bot Token field.

### Step 4: Register the webhook
**Action:** Click **Register Webhook** in the Telegram section.
- The webhook URL is `{agentUrl}/webhook/telegram`
- The Wizard verifies the token via `getMe`, then registers via `setWebhook`

### Step 5: Test
**Action:** Open Telegram, search for your bot's @username, send a message.
**Expected:** Your agent replies with the same brain as your website chat.

## Completion Message
✅ **Your agent is live on Telegram!** Visitors can DM it directly — no website or domain needed.

## Error Handling
- **Invalid bot token** → Recreate the token with @BotFather, paste again.
- **Webhook registration failed** → Make sure the Worker is deployed and the `agentUrl` is reachable (public HTTPS). Check Cloudflare Dashboard → Worker → Settings → Triggers for the routes.
- **"Telegram not configured" (503)** → The `TELEGRAM_BOT_TOKEN` secret isn't set on the deployed Worker. Redeploy after adding the token.
