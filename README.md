# A2A Agent Invention

Deploy an AI Agent from Mother Brain to your website. Visitors chat in real-time while the agent answers using your project's knowledge base via MCP tools.

## What You Get

- **A2A Endpoint** — A Cloudflare Worker that handles chat via JSON-RPC 2.0 (A2A Protocol)
- **Chat UI Widget** — Embeddable fullscreen chat overlay for your website (React component bundle with embedded Web Components)
- **Isolated Chat Database** — Local Postgres + optional Supabase sync for persistent conversation history
- **CRM View** — Monitor and manage visitor conversations from within Mother Brain
- **MCP Tool Access** — Your agent can use all Mother Brain MCP tools (search_codebase, search_memories, etc.)
- **Offline Fallback** — When the MCP Gateway is unreachable, the agent auto-queries your project's Supabase knowledge base directly — no manual configuration needed

---

## Quick Start (5 minutes)

Already have a deployed endpoint? Drop the React widget into your site:

```tsx
import { ChatWidget } from "./motherbrain-widget";

// Drop this anywhere in your React app:
<ChatWidget endpoint="https://your-worker.workers.dev" />
```

The widget auto-detects light/dark theme from the user's device (`prefers-color-scheme`). No theme prop needed. The agent name, description, and skills come from your Worker's Agent Card.

For a full walkthrough, follow the [Full Setup Guide](#full-setup-guide) below.

---

## Full Setup Guide

### Step 1: Install the Invention

1. Open Mother Brain → click **Inventions** in the sidebar
2. Click **Install** → select **A2A Agent**
3. The invention appears in your Inventions list

### Step 2: Configure Agent Identity

1. Click the A2A Agent card to open settings
2. Under **Agent Identity**:
   - Set your agent's name (e.g., "Support Bot", "Knowledge Assistant")
   - Write a description of what your agent does
3. Under **Authentication**:
   - Enter a bot user email (e.g., `agent@yourdomain.com`)
   - Paste your MCP Gateway token

### Step 3: Knowledge Base & Project Access

The A2A Agent's personality, security guardrails, and tool guidance are defined by **knowledge base files** in your project. These files get packed into the Cloudflare Worker at deploy time, baking the agent's identity directly into the endpoint.

#### Knowledge Base Files

| File | Purpose | Required |
|------|---------|----------|
| **SOUL.md** | Agent personality, identity, product knowledge, communication style | ✅ Yes |
| **SECURITY.md** | Internal security directives — what the agent must NEVER reveal (PRIVATE) | ✅ Yes |
| **SKILLS.md** | Tool selection guidance — which MCP tools to use and when | Optional |

#### Where to Put Them

Create a `knowledge-base/` directory in your project root:

```
your-project/
  knowledge-base/
    SOUL.md          ← Agent personality & identity
    SKILLS.md        ← Tool guidance (optional)
    SECURITY.md      ← Internal security rules (PRIVATE)
```

The packer also recognizes these alternative locations:
- `CF Worker/` directory (Obsidian vault convention)
- Project root (files at the top level)
- Invention's own `knowledge-base/` directory (local override)

#### Creating Knowledge Base Files

To generate template files in your project:

```bash
node scripts/pack-knowledge-base.cjs --init --source /path/to/your-project
```

This creates editable templates in `<project>/knowledge-base/`. Customize them, then pack and deploy.

#### Packing the Knowledge Base

Before deploying the Worker, pack the knowledge base files into the Worker bundle:

```bash
# Auto-detect project (searches common locations)
node scripts/pack-knowledge-base.cjs

# Explicit project directory
node scripts/pack-knowledge-base.cjs --source /path/to/your-project
```

This generates `backend/src/knowledge-base.ts` — a TypeScript module with the file contents as string constants. The Worker imports this module to build the system prompt.

> **Important:** The generated `knowledge-base.ts` is committed to the repo. To update the agent's knowledge, edit the source `.md` files, re-run the packer, then redeploy.

#### How It Gets Injected

At runtime, the Worker builds the system prompt in this order:

1. **SOUL.md** → Agent identity, personality, product knowledge
2. **SECURITY.md** → Security guardrails (what NEVER to reveal)
3. **Skill Role** → Active role for this conversation (sales, support, etc.)
4. **SKILLS.md** → Tool selection guidance
5. **Visitor Context** → Recalled memories from past conversations

> **🔒 SECURITY:** The SECURITY.md content is server-side ONLY. It is injected into the system prompt to enforce guardrails but is never exposed in API responses, client-side code, or the agent card. The `filterResponse()` function also redacts sensitive patterns (tokens, keys) from all AI output.

#### Selecting the Project in Settings

1. Under **Project Access**:
   - Select your **Primary Knowledge Base** project — this is the project whose ROMs, memories, and code index the agent will use via MCP tools
   - Optionally check additional projects for Brainstorm Mode (cross-project knowledge)
   - **Offline Fallback auto-loads:** Selecting a primary project also auto-loads the project's Supabase URL, project ID, and service_role key (fetched automatically via the Supabase Management API) into the **Offline Fallback** settings box. This enables the agent to answer from the knowledge base even when your computer is offline and the MCP Gateway can't be reached. No manual entry required — just deploy.

### Step 4: Set Up Database

#### Local Postgres (quick start)

1. Under **Chat Database**, click **Start** to provision the local Postgres database
2. The A2A schema (6 tables) is created automatically
3. Verify the status shows "running"

#### Supabase (remote backup + cloud sync)

1. Create a project at [supabase.com](https://supabase.com) (free tier works)
2. In your Supabase project's **SQL Editor**, run the schema migrations in order:

```
inventions/a2a-agent/backend/schema/
├── 001_initial.sql           ← Core tables (agents, tasks, messages, artifacts, knowledge)
├── 002_visitor_sessions.sql   ← Visitor ID columns, rate limits, indexes
├── 003_visitor_total_recall.sql ← Visitor conversation history functions
└── 004_realtime.sql           ← Supabase Realtime publication
```

3. Back in Mother Brain settings, set **Database Provider** to "Both (Local + Remote Sync)"
4. Enter your **Supabase URL** (e.g., `https://xxx.supabase.co`) and **Supabase Service Key** (Project Settings → API → `service_role`)
5. Enable **Sync local → Supabase**
6. Click **Test Connection** to verify

> 💡 For full database setup details, see [INTEGRATION.md](./INTEGRATION.md).

### Step 5: Deploy to Cloudflare

1. Under **Deploy**, enter your **Cloudflare Account ID** (find it in Cloudflare Dashboard → Workers & Pages)
2. Set a **Worker Name** (e.g., `my-a2a-agent`)
3. Set the Cloudflare Worker secrets — these are required for the endpoint to function:

| Secret | Description |
|--------|-------------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `MOTHER_BRAIN_GATEWAY_TOKEN` | Bearer token for the MCP Gateway |

   If deploying manually via Wrangler CLI:
   ```bash
   wrangler secret put SUPABASE_URL
   wrangler secret put SUPABASE_SERVICE_KEY
   wrangler secret put MOTHER_BRAIN_GATEWAY_TOKEN
   ```

4. Click **Deploy to Cloudflare** — Mother Brain's bundled Wrangler CLI handles the deployment
5. Once deployed, your endpoint URL appears in the **Endpoint** section

### Step 6: Customize the Chat UI

1. Under **Widget Settings**:
   - **Primary Color** — Accent color in hex (e.g., `#39ff14`)
   - **Branding Text** — Footer text (e.g., "Powered by Mother Brain")
   - **Agent Logo** — Custom logo (SVG, PNG, JPG via URL or upload)
2. Click the **Preview** tab to see your widget live

> The chat UI is a **fullscreen overlay**, not a corner widget. When a user triggers it (via Hero Search or programmatically), it takes over the full screen with a collapsible bottom bar.

### Step 7: Build & Embed the Widget

The A2A Agent widget is a **React component bundle** (`widget-build/src/`) that ships as TypeScript source. It contains both React components and an embedded vanilla Web Component (`<ne-hero-search>`) for the hero search input.

#### Build the Widget Bundle

1. In Settings → **Chat UI Widget**, click **Build Widget** to generate a customized bundle with your settings baked in
2. Download the bundle — it contains TypeScript source files from `widget-build/src/`
3. Copy the files into your website's project (e.g., `src/motherbrain-widget/`)
4. Install the one dependency: `npm install @rajesh896/broprint.js`

#### Integrate into Your React App

```tsx
import { ChatWidget } from "./motherbrain-widget";

function App() {
  return (
    <>
      <YourApp />
      {/* Drop-in widget — manages hero → bar → overlay state machine internally */}
      <ChatWidget endpoint="https://your-worker.workers.dev" />
    </>
  );
}
```

The `ChatWidget` component is self-contained. It manages the full state machine:
- **Hero mode** — fullscreen landing with animated search + AI-generated suggestion prompts
- **Overlay mode** — fullscreen chat conversation
- **Bar mode** — collapsed bottom bar (user clicked minimize)

#### Hero Search

The hero search input (`<ne-hero-search>`) is a vanilla TypeScript Web Component embedded inside the React bundle. It handles the animated typewriter suggestions and dispatches a `hero-search-submit` event when the user presses Enter. The `ChatWidget` wires this up automatically — no manual integration needed.

#### Available Exports

| Export | Type | Purpose |
|--------|------|---------|
| `ChatWidget` | React component | Self-contained drop-in widget (recommended) |
| `HeroSearchHost` | React component | Hero search section only (if you build your own chat UI) |
| `ChatApp` | React component | Chat overlay only (if you build your own hero) |
| `NeHeroSearchElement` | Web Component | Vanilla `<ne-hero-search>` custom element |
| `useHeroSuggestions` | React hook | AI-generated suggestion prompts |
| `getVisitorId` | Function | Broprint.js visitor identity |
| `BrainIcon` | React component | Brain SVG icon |

See [INTEGRATION.md](./INTEGRATION.md) for the full integration walkthrough.

### Step 8: Verify & Test

1. **Health check** — visit your endpoint URL in a browser, expect a JSON response
2. **Agent Card** — `curl https://your-worker.workers.dev/.well-known/agent-card.json`
3. **Send a test message** — open your website, trigger the chat, and send a message
4. **Check CRM** — back in Mother Brain, confirm the conversation appears in the CRM view

```bash
# Quick smoke test via curl
curl -X POST https://your-worker.workers.dev/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "message/send",
    "id": 1,
    "params": {
      "message": {
        "role": "user",
        "parts": [{"type": "text", "text": "Hello, what is Mother Brain?"}]
      },
      "metadata": {"source": "test"}
    }
  }'
```

---

## Guided Setup (Cerebellum Recipe)

Type `/mother setup the A2A Agent` in the Mother Brain Chat Panel for an interactive, step-by-step guided setup.

<details>
<summary>📖 Recipe: A2A Agent Setup (click to expand)</summary>

**Trigger phrases:** "set up a2a agent", "configure my agent", "a2a setup", "install the chat widget", "hero search setup", "connect search to chat", `/mother a2a setup`

### Step 1: Install the Invention
**Action:** Navigate to Inventions screen and install A2A Agent
**Check:** Is the A2A Agent invention installed? If yes, skip to Step 2.

### Step 2: Name Your Agent
**Prompt:** "What would you like to name your AI agent? This name appears in the chat header."
**Example:** "Support Bot", "Knowledge Assistant", "Mother"
**Action:** Set `agentName` in invention settings

### Step 3: Select Knowledge Base
**Prompt:** "Which project should be your agent's primary knowledge source? This determines what your agent knows about."
**Action:** List available projects as buttons, set `primaryProjectId` in invention settings

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

### Step 7: Hero Search Integration
**Prompt:** "Your agent is live! Let's set up Hero Search."
**Message:** "Hero Search (Hero ⚡️earch) is a unified Search/Chat experience. The chat UI is triggered by ANY search input field on your website."
**How it works:**
  - The chat UI is a fullscreen overlay (not a floating widget)
  - When a user types a query into any search input and hits ENTER, the fullscreen Chat UI opens with their query as the initial prompt
  - If no search results are found, an "Ask Mother" button appears to launch the chat
**Show:** Preview of the fullscreen overlay opening from a search input

### Step 8: Hero Search Hook
**Action:** Add `ChatWidget` to the website's app root
**Message:** "The React `ChatWidget` manages Hero Search, the floating bar, and the fullscreen chat overlay internally — no manual wiring needed."
**Instructions:**
  - Install the dependency: `npm install @rajesh896/broprint.js`
  - Import `ChatWidget` from the `motherbrain-widget` bundle
  - Place `<ChatWidget endpoint="{agentUrl}" />` in the app root (outside the router)
  - Hero Search is active by default — visitors type a query, hit ENTER, and the fullscreen chat overlay opens with their query as the first message

### Completion
✅ **A2A Agent is live!** Your agent endpoint is at `{agentUrl}`. Hero Search is active — visitors type a search, hit ENTER, and the fullscreen Chat UI opens with their query.

### Error Handling
- If DB start fails → "Could not start the local database. Try restarting Mother Brain."
- If deploy fails → "Deployment failed. Check your Cloudflare credentials and try again."
- If connection test fails → "Could not connect to Supabase. Verify your URL and service key."
- If endpoint test fails → "Could not reach the A2A endpoint. Verify the URL and try again."

</details>

<details>
<summary>📖 Recipe: A2A Agent Deploy (click to expand)</summary>

**Trigger phrases:** "deploy a2a agent", "deploy my agent", "deploy to cloudflare", "hero search deploy", `/mother a2a deploy`

### Prerequisites Check
- Is the A2A Agent invention installed?
- Is the local database running?
- Are Cloudflare credentials configured?
- Is the Hero Search integration configured?

### Step 1: Verify Configuration
**Check:** All required settings are filled: Agent name ✓, Bot user email ✓, Cloudflare Account ID ✓, Worker name ✓

### Step 2: Build Worker Secrets
**Action:** Configure wrangler secrets (auto-deployed from invention settings): `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `MOTHER_BRAIN_GATEWAY_TOKEN`, `VOYAGE_API_KEY`, `AI_MODEL`, `MB_SUPABASE_URL`, `MB_SUPABASE_SERVICE_KEY`, `MB_PROJECT_ID`

### Step 3: Deploy
**Action:** POST `/api/inventions/a2a-agent/deploy`
**Message:** "Deploying to Cloudflare... This may take up to 2 minutes."

### Step 4: Verify Deployment
**Action:** Test the endpoint with a message/send request (see curl example in Step 8 above)
**Expected:** Response has `result.task.status` of `"completed"`

### Step 5: Update Endpoint URL
**Action:** Set `agentUrl` to the deployed worker URL, set `deployStatus` to "deployed"

### Step 6: Test Hero Search
**Action:** Verify the Hero Search pattern works on the target website
1. Navigate to the target website
2. Type a query into any search input
3. Press **ENTER** — an AI conversation should start

### Completion
✅ **Deployed!** Your A2A endpoint is live at `{workerUrl}`.
🔗 Agent Card: `{workerUrl}/.well-known/agent-card.json`

</details>

---

## Configuration Reference

### Agent Identity

| Field | Description | Default |
|-------|-------------|---------|
| Agent Name | Display name shown in chat header | "Mother" |
| Description | What the agent does (internal) | — |

### Endpoint

| Field | Description | Default |
|-------|-------------|---------|
| A2A Endpoint URL | Your deployed worker URL | — |

### Authentication

| Field | Description | Default |
|-------|-------------|---------|
| Bot User Email | Agent's email identity | — |
| Access Token | Mother Brain access token (mb_...) | — |
| MCP Gateway Token | Bearer token for Gateway | — |

### Project Access

| Field | Description | Default |
|-------|-------------|---------|
| Primary Knowledge Base | Main project for agent knowledge | — |
| Additional Projects | Extra projects via Brainstorm Mode | — |

### Chat Database

| Field | Description | Default |
|-------|-------------|---------|
| Database Provider | Local PG, Supabase, or Both | "Both" |
| Supabase URL | Remote database URL | — |
| Supabase Service Key | Service role key | — |
| Sync | Enable local → remote sync | On |

### Widget

| Field | Description | Default |
|-------|-------------|---------|
| Primary Color | Accent color (hex) | #39ff14 |
| Branding | Footer text | "Powered by Mother Brain" |
| Agent Logo | Custom logo (URL or upload) | Mother Brain logo |

### Deploy

| Field | Description | Default |
|-------|-------------|---------|
| Cloudflare Account ID | Your CF account | — |
| Worker Name | CF Worker name | "a2a-endpoint" |

### Vectorization

| Field | Description | Default |
|-------|-------------|---------|
| Embedding Provider | Voyage AI or OpenAI | Voyage AI |
| Model | Embedding model | voyage-4-large |
| Dimensions | Vector dimensions | 1536 |

---

## A2A Protocol Methods

Your endpoint supports these JSON-RPC methods:

| Method | Description |
|--------|-------------|
| `message/send` | Send a message to the agent |
| `tasks/get` | Get task status |
| `tasks/cancel` | Cancel a task |
| `tasks/getArtifacts` | Get task outputs |
| `agent/getCard` | Get agent discovery card |
| `visitor/history` | Get visitor's conversation history |

---

## Chat UI Widget — React Bundle Deployment

The A2A Agent ships as a **React component bundle** (`widget-build/src/`). It contains React components plus an embedded vanilla Web Component (`<ne-hero-search>`) for the hero search input. The bundle is TypeScript source — you copy it into your React project and import the components you need.

### Quick Start

```tsx
import { ChatWidget } from "./motherbrain-widget";

<ChatWidget endpoint="https://a2a.motherbrain.app" />
```

### Build from Mother Brain

1. Open **Inventions → A2A Agent → Settings → Chat UI Widget**
2. Click **Build Widget** — generates a customized bundle with your settings baked in
3. Click **Download** to get the widget source files
4. Copy the **Embed Code** and give the **AI Agent Prompt** to your website developer
5. Copy the `widget-build/src/` files into your React project and import `ChatWidget`

### Dependencies

The widget has **one runtime dependency**:

```bash
npm install @rajesh896/broprint.js
```

No Tailwind, no `lucide-react`, no `react-markdown`. The bundle uses its own:
- Inline SVG icons (`BrainIcon`, `MinimizeIcon`, `MaximizeIcon`, `CloseIcon`)
- Regex-based markdown renderer (`markdown.ts`)
- CSS-in-JS inline styles with theme constants (`use-theme.ts`)

### Component API

#### `ChatWidget` (recommended — drop-in)

Self-contained widget managing the full hero → bar → overlay state machine.

```tsx
<ChatWidget
  endpoint="https://a2a.motherbrain.app"
  agentName="Mother"           // optional, defaults to Agent Card value
  agentDescription="AI support"  // optional
  branding="Powered by Mother Brain"  // optional
  logoUrl="https://..."          // optional
/>
```

#### `HeroSearchHost` (hero section only)

If you want to use only the hero search landing (and build your own chat UI):

```tsx
<HeroSearchHost
  endpoint="https://a2a.motherbrain.app"
  agentName="Mother"
  onSubmit={(query) => { /* handle search submit */ }}
  onOpenChat={() => { /* handle continue button click */ }}
/>
```

#### `ChatApp` (chat overlay only)

If you want to use only the chat overlay (and build your own hero):

```tsx
<ChatApp
  endpoint="https://a2a.motherbrain.app"
  onClose={() => { /* handle close */ }}
  onMinimize={() => { /* handle minimize */ }}
  initialQuery="Hello"  // optional — auto-sends this message on mount
/>
```

### Theme

The widget auto-detects the user's device theme via `prefers-color-scheme`:
- **Dark theme** (default): deepVoid `#0a0a0f`, neonGreen `#39ff14`, hotPink `#ff3d7f`
- **Light theme**: deepVoid `#f9fafb`, neonGreen `#059669`, hotPink `#db2777`

No `theme` prop — the widget switches automatically.

### Features

- **Hero Search** — animated octagonal search with AI-generated suggestion prompts
- **Fullscreen chat overlay** — takes over the full screen, collapsible to bottom bar
- **Instant text reveal** — AI responses appear immediately with markdown formatting
- **Tool call visualization** — expandable details showing MCP tool usage
- **Thinking progress** — shows current tool name during multi-step responses
- **Browser fingerprinting** — Broprint.js device fingerprint (`motherbrain_visitor_id`)
- **Conversation history** — auto-loads previous chats on revisit
- **Continue paused conversation** — shows message count + last message preview
- **Markdown rendering** — bold, italic, code, tables, lists, links (custom regex renderer)
- **Scroll release** — stops auto-scrolling when user scrolls up, re-enables on new message

### Build Script

For programmatic builds (CI/CD, automation):

```bash
node scripts/build-widget.cjs --config-file config.json
node scripts/build-widget.cjs --config '{"agentName":"Bot"}' --logo ./logo.svg
```

### File Locations

```
a2a-agent-invention/
├── widget-build/
│   ├── src/
│   │   ├── index.ts                ← Component exports
│   │   ├── ChatWidget.tsx          ← Drop-in widget (hero + bar + overlay)
│   │   ├── ChatApp.tsx             ← Chat overlay component
│   │   ├── HeroSearchHost.tsx      ← React wrapper for <ne-hero-search>
│   │   ├── HeroSearchElement.ts    ← Vanilla Web Component (hero search input)
│   │   ├── BrainIcon.tsx           ← Brain SVG icon component
│   │   ├── use-theme.ts            ← Theme constants + prefers-color-scheme hook
│   │   ├── markdown.ts             ← Regex-based markdown renderer
│   │   ├── visitor-identity.ts     ← Broprint.js visitor fingerprinting
│   │   ├── suggestion-cache.ts     ← AI suggestion prompt cache
│   │   ├── useHeroSuggestions.ts   ← Suggestion generation hook
│   │   └── SuggestionsPreloader.tsx ← Preload suggestions on first visit
│   └── package.json               ← Dependencies (@rajesh896/broprint.js, react, react-dom)
├── scripts/
│   └── build-widget.cjs           ← Build script for custom bundles
├── backend/                        ← Cloudflare Worker (A2A endpoint)
├── recipes/                        ← Cerebellum setup & deploy recipes
├── settings/                       ← Mother Brain settings UI
└── config.json                    ← Invention configuration
```

---

## Troubleshooting

### "Start the chat database to view conversations"
Click **Start** in the Chat Database section of Settings.

### "Deploy failed"
1. Ensure Wrangler is authenticated: `wrangler login`
2. Check your Cloudflare Account ID is correct
3. Verify your internet connection
4. Confirm all three Worker secrets are set: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `MOTHER_BRAIN_GATEWAY_TOKEN`

### Widget not loading on website
1. Verify the endpoint URL returns a health response: `curl https://your-worker.workers.dev/`
2. Check browser console for errors
3. Ensure `ChatWidget` is placed outside your router so state persists across navigation
4. Verify `@rajesh896/broprint.js` is installed

### Agent not using project knowledge
1. Verify the primary knowledge base project is selected
2. Ensure the project has ROMs or memories indexed
3. Check that the MCP Gateway token is valid

### Database schema errors
1. Ensure you ran all SQL migrations in order (001 through 004) in the Supabase SQL Editor
2. Verify tables exist: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;`
3. Expected tables: `agents`, `artifacts`, `knowledge`, `rate_limits`, `task_messages`, `tasks`

### Connection test fails
1. Verify the Supabase URL format: `https://xxx.supabase.co`
2. Ensure you're using the **service role** key (not the anon key)
3. Check that the SQL schemas have been applied

---

## Architecture

### Runtime Flow

```
Visitor → Chat UI Widget (React ChatWidget) → A2A Endpoint (CF Worker) → MCP Gateway → Mother Brain
                                                  ↓
                                         Chat Database (PG + Supabase)
```

### Knowledge Base Packing (Build Time)

```
Project Files                    Packer Script                     Cloudflare Worker
─────────────                    ─────────────                     ──────────────────
SOUL.md       ─┐                                               ┌─ System Prompt:
SECURITY.md   ─┼→ pack-knowledge-base.cjs → knowledge-base.ts ─┤   1. SOUL (personality)
SKILLS.md    ─┘   (discovers files)     (generated module)    │   2. Security (guardrails)
                                                               │   3. Skill Role
                                                               │   4. Tool Guidance
                                                               │   5. Visitor Context
                                                               └─ Per-conversation
```

### Backend Source Files

```
backend/src/
├── index.ts            ← Hono app — JSON-RPC routing, CORS, rate limiting
├── task-handler.ts     ← Message processing, skill routing, system prompt builder
├── knowledge-base.ts   ← AUTO-GENERATED — packed KB content + buildSystemPrompt()
├── mcp.ts              ← MCP client — tool discovery, agentic chat loop
├── security.ts         ← Input sanitization, response filtering, rate limiting
├── supabase.ts         ← Supabase client wrapper
├── types.ts            ← Shared TypeScript types
└── agent-card.json     ← A2A Agent Card (served at /.well-known/agent-card.json)
```

### Scripts

```
scripts/
├── pack-knowledge-base.cjs   ← Packs SOUL.md, SKILLS.md, SECURITY.md into the Worker
└── deploy-to-mega.cjs         ← Packages + publishes invention to registry
```

---

## License

Part of the Mother Brain project by Native Apps Dev.
