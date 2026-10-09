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
**Action:** Paste the token into the Wizard → Telegram → **Create Your Bot** slide.

### Step 4: Test & Register Webhook
**Action:** Click **Test & Register Webhook** (Telegram slide 2).
- Verifies the token with Telegram (`getMe`)
- Registers the webhook at `{agentUrl}/webhook/telegram`
- **Verifies your deployed agent end-to-end** — the test only passes if the live Worker has your token and can receive messages

**IMPORTANT:** if you added or changed the bot token, you must **Deploy to Cloudflare again** before this test can pass — the token deploys as a Worker secret.

### Step 5: Make it YOUR agent — Owner verification
The bot treats everyone as a visitor by default. Verify yourself as the **owner** to unlock owner mode (goals, deals, strategy, owner-authorized actions) in your DMs.

**Option A — durable (recommended):**
1. DM your bot: `/whoami` — it replies with your Telegram user ID
2. Paste that ID into Wizard → Telegram → **Owner & Channels** → "Owner Telegram User ID"
3. Deploy to Cloudflare once more (the ID deploys as a Worker secret)

**Option B — instant, no redeploy:**
1. Set any short code in **Owner Link Code** (Owner & Channels slide) and deploy once
2. DM your bot: `/link YOUR-CODE` — it recognizes you immediately (no redeploy needed when you change nothing else)

You can use both — the ID is the durable record; `/link` is the instant path.

### Step 6: Test
**Action:** Open Telegram, search for your bot's @username, send a message.
**Expected:** Your agent replies with the same brain as your website chat. As the owner, ask it about its goals or deals — owner-mode answers, not visitor-sales mode.

## Channels & Groups

Your agent can also live where your community does:

**Telegram CHANNELS** (broadcast stage — e.g., a public channel for your agent's activity):
1. Add the bot to your channel as an **Admin** (channel → Manage Channel → Administrators → Add Admin)
2. **Post as yourself** (not as an anonymous admin) — anonymous admin posts arrive from a bot account and are ignored
3. The agent replies to your posts as new channel posts

**Telegram GROUPS** (the natural venue for agents + people talking together):
1. Add the bot to the group
2. Ask @BotFather → `/setprivacy` → select your bot → **Disable** — so the bot can see all group messages
3. The bot replies when **@mentioned**, replied-to, or sent a command

**Loop safety:** agents never respond to other bots' messages — two agents in the same channel/group can never trigger each other endlessly.

## Completion Message
✅ **Your agent is live on Telegram!** Visitors can DM it directly, you command it as its owner, and it can work your channel or group — no website or domain needed.

## Error Handling
- **Invalid bot token** → Recreate the token with @BotFather, paste again.
- **Webhook registration failed** → Make sure the Worker is deployed and the `agentUrl` is reachable (public HTTPS). Check Cloudflare Dashboard → Worker → Settings → Triggers for the routes.
- **"…deployed agent returned 503 — it doesn't have your token secret yet"** → The `TELEGRAM_BOT_TOKEN` secret isn't on the deployed Worker. Click **Deploy to Cloudflare**, then run the test again.
- **"…NOT registered — … is not running your agent's worker code (404)"** (v1.2.361+) → The `agentUrl` points at something that is NOT the A2A Worker — typically a website gateway (Encore app / NNN-style front door) occupying the `a2a.` subdomain. Two valid fixes: (a) point the wizard's Agent URL at the agent's real `*.workers.dev` origin, or (b) have the gateway forward `/webhook/telegram` (POST) and `/webhook/telegram/info` (GET) to the worker. Since v1.2.361 the button verifies BEFORE registering, so a failed test changes nothing — the existing webhook is left as-is.
- **Bot silent in a channel** → Is the bot an admin? Did you post as yourself (not anonymous)? Bot posts are ignored by design (loop protection).
- **Bot silent in a group** → Run @BotFather → `/setprivacy` → Disable, then @mention the bot directly.
- **Owner mode not activating** → Run `/whoami` and confirm the ID matches the wizard field; redeploy. Or use `/link CODE` (Option B) for instant recognition.

## Custom Domains & Gateways (READ BEFORE giving the agent a pretty `a2a.` address)

The wizard's **Agent URL** field serves TWO jobs at once: it is the agent's
**public identity** AND the **origin where the Worker's own routes live**
(Telegram webhook registration + verification). Both jobs are satisfied by one
URL only when the pretty domain points **directly at the agent's Worker**.

**Rule 1 — attach pretty domains to the Worker itself.** Add the subdomain as
a Cloudflare **custom domain on the agent's Worker** (like `a2a.motherbrain.app`
and `a2a.agentext.pro` are attached directly to their Workers). Then everything
— chats, knocks, Telegram, the wizard test — is green on one URL.

**Rule 2 — website gateways stay on the WEBSITE's domain, never on `a2a.`**
If a website needs an A2A chat proxy (like `agentext.pro/chat`), host it on the
website's own domain and have it forward to the agent's endpoint. Do NOT put a
gateway worker on the `a2a.` subdomain. (Live incident 2026-10-08: the NNN
gateway took `a2a.nearneighbors.network` — chats and knocks were forwarded, but
Telegram updates 404'd at the gateway and the bot died every time the wizard's
Test & Register button was clicked.)

**Rule 3 — if a gateway MUST live on `a2a.`,** it has to forward the Worker's
own routes too, at minimum: `POST /webhook/telegram`, `GET /webhook/telegram/info`,
plus `POST /neighbor` and the JSON-RPC `POST /` — preserving method, body, and
headers. Otherwise point the wizard at the Worker's `*.workers.dev` URL and
leave the pretty address for public A2A traffic only.

**Why clicks can't hurt anymore (v1.2.361):** the Test & Register button now
verifies the deployed endpoint BEFORE calling Telegram's `setWebhook`. A
failing check registers NOTHING and leaves the existing (self-healed) webhook
untouched. Worst case, the button is now a diagnostic — never a kill switch.
