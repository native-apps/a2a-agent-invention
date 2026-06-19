# How to Set Up the A2A Agent Invention

This is the official setup guide for the **A2A Agent Invention** — deploy an AI agent from Mother Brain to your website via the A2A Protocol. Visitors type a query in your search field, hit ENTER, and a fullscreen chat opens with their question. The agent answers using your project's knowledge base via MCP tools.

> **Looking for technical depth?** This guide is the user-facing walkthrough. For the full developer reference (schema SQL, `wrangler` secrets, component API, theme constants), see [README.md](../README.md) and [INTEGRATION.md](../INTEGRATION.md).

---

## 📋 Prerequisites

| Requirement | What You Need | Where to Get It |
|---|---|---|
| **Mother Brain** | Desktop app installed & running | [motherbrain.app](https://motherbrain.app) |
| **Supabase Account** | Project URL + Service Role Key | [supabase.com](https://supabase.com) (free tier works) |
| **Cloudflare Account** | Account ID + authenticated Wrangler CLI | [cloudflare.com](https://cloudflare.com) (free tier works) |

### Keys You'll Need

1. **Supabase Project URL** — format: `https://xxx.supabase.co` (Project Settings → API)
2. **Supabase Service Role Key** — (Project Settings → API → `service_role`)
3. **Cloudflare Account ID** — (Cloudflare Dashboard → Workers & Pages)
4. **Wrangler CLI authenticated** — run `npx wrangler login`

> ⚠️ Use the **service role** key, not the anon key. The anon key won't have permission to run schema migrations or write to the conversation tables.

---

## ⚡ The Quick Path: Guided Recipe

The fastest way to set everything up is the in-app guided recipe. Open the Mother Brain Chat Panel and type:

```
/mother setup the A2A Agent
```

This triggers a step-by-step walkthrough that handles each setting in sequence. Prefer to do it manually? Continue below.

---

## 🚀 Manual Setup (Step by Step)

### Step 1 — Install the Invention

Open the Mother Brain desktop app → **Inventions** in the sidebar → click **Install** (or **Enable**) → select **A2A Agent**.

Once enabled, the invention opens with **four tabs** (see [The Four Tabs](#-the-four-tabs) below for what each does):

- **Settings** — configure Supabase, Cloudflare, agent identity, and knowledge base
- **Conversations (CRM)** — view and manage visitor conversations
- **Preview** — test your agent live
- **ReadMe** — the project documentation (this repo's `README.md`)

### Step 2 — Name Your Agent

In the **Settings** tab, set your **Agent Name** (e.g., "Support Bot", "Knowledge Assistant", "Mother"). This appears in the chat header and the Agent Card that other A2A-compatible agents can discover.

### Step 3 — Select Your Knowledge Base

Still in **Settings**, under **Project Access**:

- Select your **Primary Knowledge Base** project — this is the project whose ROMs, memories, and code index the agent will use via MCP tools. This determines what your agent knows about.
- Optionally check additional projects for cross-project knowledge (Brainstorm Mode).

> 💡 **Offline Fallback auto-loads.** Selecting a primary project also auto-loads the project's Supabase URL, project ID, and service role key into the Offline Fallback settings. This lets the agent answer from the knowledge base even when your computer is offline and the MCP Gateway can't be reached. No manual entry required — just deploy.

### Step 4 — Configure Your Credentials

In **Settings**, enter:

- **Supabase URL** — your project URL (starts with `https://`)
- **Supabase Service Role Key** — your service role key (not the anon key)
- **Cloudflare Account ID** — for deployment

Use the **Test Connection** action (see [Available Actions](#-available-actions)) to verify the Supabase connection before proceeding.

### Step 5 — Start the Database

Under **Chat Database**, click **Start** to provision the local Postgres database. This creates the A2A schema — **6 tables** — automatically:

| Table | Purpose |
|---|---|
| `agents` | Agent registry & configuration |
| `tasks` | A2A task lifecycle (submitted → working → completed) |
| `task_messages` | Conversation messages within tasks |
| `artifacts` | Agent outputs (text responses, tool call metadata) |
| `knowledge` | Vector-searchable knowledge base (pgvector) |
| `rate_limits` | Request throttling per visitor/identifier |

Verify the database status shows **"running"**.

> 💡 You can also provision the schema directly on Supabase using the **Provision DB** action (runs the SQL migrations in `backend/schema/` automatically). For full database setup details, see [INTEGRATION.md](../INTEGRATION.md).

### Step 6 — Deploy to Cloudflare

Click **Deploy** to push the A2A endpoint (a JSON-RPC server) to Cloudflare Workers. Your agent goes live at your Worker URL.

The deploy action provisions these secrets (most are auto-populated from your project settings):

| Secret | Source | Purpose |
|---|---|---|
| `VOYAGE_API_KEY` | Mother Brain app settings | Embeddings for vectorizing the knowledge base |
| `AI_MODEL` | Mother Brain app settings | Which AI model the agent uses |
| `MB_SUPABASE_URL` | Auto-loaded from primary project | Mother Brain project Supabase (offline fallback) |
| `MB_SUPABASE_SERVICE_KEY` | Auto-loaded from primary project | Project service role key (offline fallback) |
| `MB_PROJECT_ID` | Auto-loaded from primary project | Your Mother Brain project ID |
| `MOTHER_BRAIN_GATEWAY_TOKEN` | Auto-loaded from MB app master API key | Authenticates the Worker to the Mother Brain MCP Gateway (AI routing + MCP tools) |

> The deployed Worker connects to the **Mother Brain MCP Gateway** for AI routing and MCP tool access (that's where the agent's intelligence comes from). The gateway token is auto-populated from your Mother Brain app's master API key and pushed on every deploy — no manual setup needed. For manual deployment via `wrangler` (advanced), see [INTEGRATION.md](../INTEGRATION.md).

### Step 7 — Verify & Test

Run the **Health Check** action to confirm the Worker is deployed and responding. Then use the **Preview** tab to send a test message directly to your agent. Messages persist in the database, so they'll still be there when you switch screens and come back.

**Or send a test via curl (Quick Smoke Test):**

```bash
curl -X POST https://your-worker-url/ \
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

Expected: a JSON-RPC response with `result.task` and `result.artifacts`.

**Other verification endpoints:**

```bash
# Health check
curl https://your-worker-url/

# Agent Card discovery (canonical A2A v1.0 path)
curl https://your-worker-url/.well-known/agent-card.json
```

> The legacy path `agent.json` is also served for backward compatibility, but `agent-card.json` is canonical.

After sending a test message, check the **Conversations (CRM)** tab to confirm the conversation appears.

---

## 🪟 The Four Tabs

When you open the A2A Agent invention, you get four tabs:

| Tab | What It Does |
|---|---|
| **Settings** | Configure agent identity, knowledge base project, Supabase, Cloudflare, and run actions |
| **Conversations (CRM)** | Monitor and manage every visitor conversation in real time |
| **Preview** | Test your agent live — send messages and see exactly what visitors will see |
| **ReadMe** | The full project documentation (this repo's `README.md`) |

---

## 🔧 Available Actions

The Settings tab exposes these actions:

| Action | Type | What It Does |
|---|---|---|
| **Deploy** | `cloudflare-deploy` | Pushes the Worker to Cloudflare Workers |
| **Provision DB** | `supabase-provision` | Runs SQL migrations on your Supabase project |
| **Start DB** | `embedded-pg-start` | Starts the embedded PostgreSQL instance (local dev) |
| **Stop DB** | `embedded-pg-stop` | Stops the embedded PostgreSQL instance |
| **Health Check** | `endpoint-check` | Verifies your deployed Worker is responding |
| **Test Connection** | `supabase-test` | Verifies your Supabase credentials are valid |
| **Status** | `status` | Shows live conversation & message counts |

---

## 🎨 Embed the Chat Widget on Your Website

The A2A Agent ships as a **React component bundle** (in `widget-build/src/`). Copy the bundle into your React/Vite/TypeScript project and drop in `ChatWidget`:

```bash
# The only runtime dependency
npm install @rajesh896/broprint.js
```

```tsx
// src/App.tsx
import { ChatWidget } from "@/motherbrain-widget";

function App() {
  return (
    <>
      {/* your routes / content */}
      <ChatWidget endpoint="https://your-worker-url" />
    </>
  );
}
```

> Place `ChatWidget` **outside your router** so chat state persists across page navigation.

That single component manages the entire experience — hero search, floating bar, and fullscreen chat — internally. The bundle includes inline SVG icons, a regex-based markdown renderer, CSS-in-JS styles, and theme constants, so there's **no Tailwind, `lucide-react`, or `react-markdown`** to configure.

> For the full component API (`ChatWidget`, `HeroSearchHost`, `ChatApp`), theme editing (`use-theme.ts`), and build instructions, see [INTEGRATION.md](../INTEGRATION.md).

### Theme

The widget **auto-detects** the visitor's device theme via `prefers-color-scheme` — no configuration needed:

- **Dark** (default): Deep Void `#0a0a0f`, Neon Green `#39ff14`, Hot Pink `#ff3d7f`
- **Light**: Deep Void `#f9fafb`, Neon Green `#059669`, Hot Pink `#db2777`

The widget re-renders live when the visitor switches their device theme — no page reload.

---

## 👀 The Visitor Experience

The chat UI is a **fullscreen overlay**, not a corner widget:

1. **Hero Search** — the visitor types a query in the animated search field
2. **Chat Opens** — pressing ENTER opens a fullscreen chat with their query as the first message
3. **Bottom Bar** — when the visitor minimizes, the chat collapses to a full-width bottom bar; clicking expand returns it to fullscreen
4. **Persistent Identity** — visitors are identified via Broprint.js fingerprinting. Their conversation history is recalled across sessions, so the agent remembers past interactions.
5. **Instant Responses** — AI responses render immediately with full markdown (code blocks, links, lists).

---

## 🤖 Guided Setup (In-App)

You can run the entire setup interactively. Type in the Mother Brain Chat Panel:

```
/mother setup the A2A Agent
```

This triggers a step-by-step guided recipe that walks you through every field in the Settings screen.

---

## 🛠️ Troubleshooting

| Issue | Fix |
|---|---|
| **DB start fails** | Restart Mother Brain and try again |
| **Worker won't deploy** | Verify your Cloudflare Account ID and that `wrangler` is authenticated (`npx wrangler login`) |
| **DB connection fails** | Double-check the Supabase URL (starts with `https://`) and that you're using the **service role** key (not anon). Use the **Test Connection** action. |
| **Schema errors** | Use the **Provision DB** action to run the migrations. Expected tables: `agents`, `artifacts`, `knowledge`, `rate_limits`, `task_messages`, `tasks` |
| **Agent Card not found** | Ensure the Worker deployed successfully; the card lives at `/.well-known/agent-card.json` |
| **Messages not persisting** | Run **Provision DB** (or **Start DB** for local) to ensure all tables exist |
| **Widget not loading** | Confirm the bundle is imported and `@rajesh896/broprint.js` is installed. Check the browser console for errors. |

---

## 📚 Related Documentation

- [README.md](../README.md) — Full project reference (in-app ReadMe tab)
- [INTEGRATION.md](../INTEGRATION.md) — Developer integration guide (schema, secrets, component API)
- [docs/A2A-Agent-Knowledge-Base.md](./A2A-Agent-Knowledge-Base.md) — Mother's Knowledge Base document
