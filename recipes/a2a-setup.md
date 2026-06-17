# Recipe: A2A Agent Setup

## Trigger
- "set up a2a agent"
- "configure my agent"
- "a2a setup"
- "help me set up the agent"
- "install the chat widget"
- "hero search setup"
- "connect search to chat"
- "/mother a2a setup"

## Steps

### Step 1: Install the Invention
**Action:** Navigate to Inventions screen and install A2A Agent
**Button:** [Open Inventions Screen]
**Check:** Is the A2A Agent invention installed? If yes, skip to Step 2.

### Step 2: Name Your Agent
**Prompt:** "What would you like to name your AI agent? This name appears in the chat header."
**Example:** "Support Bot", "Knowledge Assistant", "Mother"
**Action:** Set `agentName` in invention settings

### Step 3: Select Knowledge Base
**Prompt:** "Which project should be your agent's primary knowledge source? This determines what your agent knows about."
**Action:** List available projects as buttons
**Action:** Set `primaryProjectId` in invention settings
**Auto-configure:** Selecting a project also auto-loads the **Offline Fallback** credentials — the project's Supabase URL, project ID, and service_role key (fetched automatically via the Supabase Management API). No manual entry needed. This enables the agent to answer from the knowledge base even when your computer is offline.

### Step 4: Start the Database
**Action:** POST `/api/inventions/a2a-agent/start-db`
**Message:** "Starting local chat database... This creates the A2A tables for storing conversations."
**Verify:** Check that `localPgStatus` is "running"

### Step 5: Configure Supabase (Optional)
**Prompt:** "Would you like to sync conversations to a remote Supabase database? This enables cloud backup and multi-device access."
**Buttons:** [Yes, connect Supabase] [Skip for now]
**If Yes:**
  - Prompt for Supabase URL
  - Prompt for Service Key
  - Test connection
  - Enable sync

### Step 6: Deploy to Cloudflare
**Prompt:** "Ready to deploy your agent! You'll need a Cloudflare account."
**Prerequisites Check:**
  - Cloudflare Account ID entered?
  - Worker name set?
**Action:** POST `/api/inventions/a2a-agent/deploy`
**Message:** "Deploying to Cloudflare Workers..."

### Step 7: Chat UI Widget (Web Component)
**Prompt:** "Your agent is live! Let's embed the chat widget on your website."
**Message:** "The Chat UI Widget is a self-contained `<motherbrain-chat>` Web Component — no React, no framework needed."
**Action:** Navigate to Settings → Chat UI Widget → Click **Build Widget**
**Action:** Download the `motherbrain-chat.js` bundle
**Action:** Copy the script tag + custom element to the website HTML:
```html
<script src="motherbrain-chat.js"></script>
<motherbrain-chat
  endpoint="https://your-agent.workers.dev"
  agent-name="{agentName}"
  theme="dark"
  primary-color="#6366f1"
></motherbrain-chat>
```
**Message:** "The chat widget renders automatically. No build step, no framework — just a script tag and a custom element."
**Tip:** For the full step-by-step guide including Hero Search setup and custom logos, run the **Widget Deploy** recipe: `/mother a2a widget`

### Step 8: Hero Search Integration
**Prompt:** "Would you like to enable Hero Search? Visitors type a search, hit ENTER, and the chat opens with their query."
**Buttons:** [Enable Hero Search] [Skip for now]
**How it works:**
  - Set `hero-search="true"` on the `<motherbrain-chat>` element
  - The chat UI is a fullscreen overlay (not just a floating widget)
  - When a user types a query into any search input and hits ENTER, the fullscreen Chat UI opens with their query as the initial prompt
  - If no search results are found, an "Ask Mother" button appears to launch the chat
**Action:** Add the Hero Search hook to wire search inputs:
```javascript
document.querySelectorAll('input[type="search"], input[role="searchbox"]').forEach(input => {
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const chat = document.querySelector('motherbrain-chat');
      if (chat) chat.openChat(input.value);
    }
  });
});
```

## Completion Message
✅ **A2A Agent is live!** Your agent endpoint is at `{agentUrl}`. The `<motherbrain-chat>` Web Component is embedded on your website. If Hero Search is enabled, visitors type a search, hit ENTER, and the fullscreen Chat UI opens with their query.

## Error Handling
- If DB start fails → "Could not start the local database. Try restarting Mother Brain."
- If deploy fails → "Deployment failed. Check your Cloudflare credentials and try again."
- If connection test fails → "Could not connect to Supabase. Verify your URL and service key."
- If endpoint test fails → "Could not reach the A2A endpoint. Verify the URL and try again."
- If no search results + "Ask Mother" fails → "Chat UI failed to open. Check browser console for errors."
