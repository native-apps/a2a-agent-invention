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

### Step 7: Chat UI Widget (React Bundle)
**Prompt:** "Your agent is live! Let's embed the chat widget on your website."
**Message:** "The Chat UI Widget is a **React component bundle** — drop it into any React/Vite/TypeScript project. It includes Hero Search, a floating bottom bar, and the fullscreen chat overlay."
**Action:** Navigate to Settings → Chat UI Widget → Click **Build Widget**
**Action:** Download the `motherbrain-widget` bundle (TypeScript source files from `widget-build/src/`)
**Action:** Copy the bundle into the website project and add the widget:
```bash
# Install the only runtime dependency
npm install @rajesh896/broprint.js
```
```tsx
import { ChatWidget } from "./motherbrain-widget";

// Place OUTSIDE your router so chat state persists across navigation
<ChatWidget endpoint="https://your-agent.workers.dev" />
```
**Message:** "The widget renders automatically. Theme is auto-detected from the visitor's device (dark/light). Agent name comes from your Agent Card — no manual configuration needed."
**Tip:** For the full step-by-step guide including Hero Search setup and custom logos, run the **Widget Deploy** recipe: `/mother a2a widget`

### Step 8: Hero Search Integration
**Prompt:** "Would you like to enable Hero Search? Visitors type a search, hit ENTER, and the chat opens with their query."
**Buttons:** [Enable Hero Search] [Skip for now]
**How it works:**
  - Hero Search is **built into `ChatWidget`** by default — no separate wiring needed
  - The chat UI is a fullscreen overlay (not a floating widget)
  - When a visitor types a query into the hero search field and hits ENTER, the fullscreen Chat UI opens with their query as the initial prompt
  - When minimized, the chat collapses to a full-width bottom bar; clicking expand returns it to fullscreen
  - A "Continue paused conversation" button appears if the visitor has an existing conversation
**Message:** "Hero Search is active by default in the ChatWidget — visitors type a search, hit ENTER, and the fullscreen Chat UI opens with their query."

## Completion Message
✅ **A2A Agent is live!** Your agent endpoint is at `{agentUrl}`. The React `ChatWidget` is embedded on your website with Hero Search active — visitors type a search, hit ENTER, and the fullscreen Chat UI opens with their query.

## Error Handling
- If DB start fails → "Could not start the local database. Try restarting Mother Brain."
- If deploy fails → "Deployment failed. Check your Cloudflare credentials and try again."
- If connection test fails → "Could not connect to Supabase. Verify your URL and service key."
- If endpoint test fails → "Could not reach the A2A endpoint. Verify the URL and try again."
- If no search results + "Ask Mother" fails → "Chat UI failed to open. Check browser console for errors."
