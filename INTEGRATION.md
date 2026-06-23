# Integration Guide — A2A Chat UI as a Mother Brain Plugin

This guide walks through integrating the A2A Chat UI bundle into the Mother Brain app as a plugin. The goal is to allow any Mother Brain user to deploy their own A2A chat agent on their website.

## Prerequisites

1. **Supabase Project** — A Supabase project with the A2A schema. You'll need:
   - Project URL (e.g., `https://xxx.supabase.co`)
   - Service role key (bypasses RLS — keep this secret)
   
2. **Cloudflare Account** — For deploying the A2A Worker. You'll need:
   - A Cloudflare account with Workers enabled
   - `wrangler` CLI installed and authenticated (`wrangler login`)
   - A custom domain or workers.dev subdomain

3. **Mother Brain MCP Gateway** — A running MCP Gateway that exposes:
   - `POST /v1/chat/completions` — OpenAI-compatible AI Router
   - `POST /` — JSON-RPC endpoint for MCP tools (tools/list, tools/call)
   - A valid bearer token for authentication

## Step 1: Database Setup

Run the SQL schemas in your Supabase project's SQL Editor:

### Schema 1: Core Tables
Open `backend/schema/001_initial.sql` and execute it in the Supabase SQL Editor. This creates:

- `agents` — Agent registry (name, URL, agent card, status)
- `tasks` — A2A task lifecycle (submitted → working → completed)
- `task_messages` — Conversation messages within tasks
- `artifacts` — Agent outputs (text responses, tool call metadata)
- `knowledge` — Vector-searchable knowledge base (pgvector)
- `match_knowledge()` — Cosine similarity search function
- Auto-updating `updated_at` triggers

### Schema 2: Visitor Sessions
Open `backend/schema/002_visitor_sessions.sql` and execute it. This adds:

- `visitor_id` columns on `tasks` and `task_messages`
- `rate_limits` table with identifier + type tracking
- `check_rate_limit()` PostgreSQL function
- `cleanup_expired_rate_limits()` maintenance function
- Indexes for fast visitor lookups

### Verify
After running both schemas, confirm tables exist:
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```
Expected: `agents`, `artifacts`, `knowledge`, `rate_limits`, `task_messages`, `tasks`

## Step 2: Backend Deployment

### 2a. Install Dependencies
```bash
cd backend
npm install
```

### 2b. Configure Worker
Edit `backend/wrangler.toml` if needed:
- Change `name` to your desired Worker name
- Update `compatibility_date` if desired
- The `ENVIRONMENT` var is already set to `"production"`

### 2c. Set Secrets

> 💡 **Using the MB app's Deploy action?** All six secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `MOTHER_BRAIN_GATEWAY_TOKEN`, `VOYAGE_API_KEY`, `AI_MODEL`, `MB_PROJECT_ID`/`MB_SUPABASE_*`) are auto-pushed from the invention's Settings fields — skip this step. The commands below are only needed for **manual `wrangler deploy`** (advanced).

```bash
wrangler secret put SUPABASE_URL
# Paste your Supabase project URL when prompted

wrangler secret put SUPABASE_SERVICE_KEY
# Paste your service_role key when prompted

wrangler secret put MOTHER_BRAIN_GATEWAY_TOKEN
# Paste your MCP Gateway bearer token when prompted
```

### 2d. Deploy
```bash
wrangler deploy
```

This deploys to `https://<worker-name>.<your-subdomain>.workers.dev`. You can also bind a custom domain (e.g., `a2a.yourdomain.com`) via the Cloudflare dashboard.

### 2e. Verify Deployment
```bash
# Health check
curl https://<your-worker-url>/

# Agent Card discovery (canonical v1.0 path)
curl https://<your-worker-url>/.well-known/agent-card.json

# Legacy paths (also served for backward compat)
# curl https://<your-worker-url>/.well-known/agent.json
# curl https://<your-worker-url>/agent.json

# Test message/send
curl -X POST https://<your-worker-url>/ \
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
      "skillId": "product-info",
      "metadata": {"source": "test"}
    }
  }'
```

Expected: JSON-RPC response with `result.task` and `result.artifacts`.

## Step 3: Frontend Integration

The A2A Agent widget is a **React component bundle** in `widget-build/src/`. It ships as TypeScript source files — you copy them into your React/Vite/TypeScript project and import the components.

### 3a. Copy the Widget Bundle

Copy the `widget-build/src/` directory into your project:

```
your-project/src/
└── motherbrain-widget/     ← Copy all files from widget-build/src/
    ├── index.ts               ← Component exports
    ├── ChatWidget.tsx          ← Drop-in widget (hero + bar + overlay)
    ├── ChatApp.tsx             ← Chat overlay component
    ├── HeroSearchHost.tsx      ← React wrapper for <ne-hero-search>
    ├── HeroSearchElement.ts    ← Vanilla Web Component (hero search input)
    ├── BrainIcon.tsx           ← Brain SVG icon
    ├── use-theme.ts            ← Theme constants + prefers-color-scheme
    ├── markdown.ts             ← Regex-based markdown renderer
    ├── visitor-identity.ts     ← Broprint.js visitor fingerprinting
    ├── suggestion-cache.ts     ← AI suggestion prompt cache
    ├── useHeroSuggestions.ts   ← Suggestion generation hook
    └── SuggestionsPreloader.tsx ← Preload suggestions on first visit
```

### 3b. Install Dependencies

```bash
npm install @rajesh896/broprint.js
```

That's the only runtime dependency. The bundle already includes:
- Inline SVG icons (no `lucide-react` needed)
- Regex-based markdown renderer (no `react-markdown` or `remark-gfm` needed)
- CSS-in-JS inline styles (no Tailwind config needed)
- Theme constants (no CSS variables to add)

### 3c. Add ChatWidget to App Root

The simplest integration — drop `ChatWidget` into your app:

```tsx
// src/App.tsx
import { ChatWidget } from "@/motherbrain-widget";

function App() {
  return (
    <>
      <BrowserRouter>
        <Routes>
          {/* Your routes */}
        </Routes>
      </BrowserRouter>
      {/* Drop-in widget — manages hero → bar → overlay internally */}
      <ChatWidget endpoint="https://your-worker-url" />
    </>
  );
}
```

**Important**: Place `ChatWidget` OUTSIDE your router so the chat state persists across page navigation.

### 3d. Hero Search

The `ChatWidget` includes Hero Search by default. The hero search input (`<ne-hero-search>`) is a vanilla Web Component that handles:
- Animated octagonal search box with gradient border
- AI-generated typewriter suggestion prompts
- Enter key → opens fullscreen chat with the query
- Brain icon click → submits the current suggestion

The `ChatWidget` wires this up automatically. No manual integration needed.

If you want to use `HeroSearchHost` separately (without `ChatWidget`):

```tsx
import { HeroSearchHost } from "@/motherbrain-widget";

<HeroSearchHost
  endpoint="https://your-worker-url"
  agentName="Mother"
  onSubmit={(query) => {
    // Open your own chat UI with this query
  }}
  onOpenChat={() => {
    // Handle "Continue paused conversation" button click
  }}
/>
```

### 3e. Theme

The widget auto-detects the user's device theme via `prefers-color-scheme`. No configuration needed:
- **Dark** (default): deepVoid `#0a0a0f`, neonGreen `#39ff14`, hotPink `#ff3d7f`
- **Light**: deepVoid `#f9fafb`, neonGreen `#059669`, hotPink `#db2777`

The widget re-renders live when the user switches their device theme — no page reload required.

### 3f. BrainIcon

The bundle includes its own `BrainIcon` component with inline SVG. No external icon library needed. If you set a `logoUrl`, the icon renders the custom logo instead of the default brain SVG.

### Hero Search Architecture

**Hero Search (Hero ⚡️earch)** is a unified Search/Chat experience that replaces the traditional "floating chat widget" approach.

- When a user types in the hero search input and hits **ENTER**, the fullscreen Chat UI opens.
- Their search query becomes the first message to the AI agent.
- The chat UI is a **fullscreen overlay**, not a corner widget.
- When the user clicks minimize, the chat **collapses to a full-width bottom bar**.
- Clicking the expand button on the bar returns the chat to fullscreen.
- A "Continue paused conversation" button appears on the hero screen if the visitor has an existing conversation.

## Step 4: Customization

### Changing Skills
Edit `backend/src/task-handler.ts` → `SKILLS` object. Each skill has:
- `name` — Display name
- `systemPrompt` — Instructions for the AI agent

Add a new skill:
```typescript
const SKILLS = {
  "my-custom-skill": {
    name: "My Custom Skill",
    systemPrompt: "You are a helpful assistant for...",
  },
  // ... existing skills
};
```

Then add it to `backend/agent-card.json` → `skills` array.

### Changing System Prompts
Each skill's `systemPrompt` controls how the AI responds. Key guidelines:
- Keep concise (150-300 word responses for chat)
- Include available site pages for linking
- Always include the SECURITY guardrail line
- Specify markdown formatting expectations

### Changing Theme Colors
Edit `widget-build/src/use-theme.ts` → `T_DARK` and `T_LIGHT` constants:
- `deepVoid` — Chat background
- `neonGreen` — Primary accent
- `hotPink` — User message accent
- `darkMatter` — Card/input background

The widget uses `prefers-color-scheme` to switch between `T_DARK` and `T_LIGHT` automatically.

### Agent Logo
The chat UI displays a logo in the header and bottom bar.

- **Default**: Mother Brain brain icon (inline SVG rendered by the `BrainIcon` component)
- **Custom logo**: set `logoUrl` on the `ChatWidget` (or `HeroSearchHost`) component
- **Supported formats**: SVG, PNG, JPG — either uploaded files or remote URLs
- **Rendering**: the `BrainIcon` component checks for `logoUrl` and renders the custom logo when set, falling back to the default brain SVG

### Changing the Agent Card
Edit `backend/src/agent-card.json`:
- `name` — Agent display name
- `description` — Agent description for discovery
- `url` — Your Worker URL
- `skills` — Available skills with IDs, names, descriptions, tags

## Step 5: Testing

### Backend Tests
```bash
# Health check
curl https://<worker-url>/

# Agent Card
curl https://<worker-url>/.well-known/agent-card.json

# Send a message
curl -X POST https://<worker-url>/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "message/send",
    "id": 1,
    "params": {
      "message": {
        "role": "user",
        "parts": [{"type": "text", "text": "What are the features?"}]
      },
      "skillId": "product-info",
      "metadata": {"source": "test", "visitor_id": "vid_test123"}
    }
  }'

# Fetch visitor history
curl -X POST https://<worker-url>/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "visitor/history",
    "id": 2,
    "params": {
      "visitor_id": "vid_test123",
      "limit": 5
    }
  }'

# Rate limit test (send 21 rapid requests)
for i in $(seq 1 25); do
  echo "Request $i:"
  curl -s -X POST https://<worker-url>/ \
    -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"message/send\",\"id\":$i,\"params\":{\"message\":{\"role\":\"user\",\"parts\":[{\"type\":\"text\",\"text\":\"test $i\"}]}}}" \
    | jq '.error // .result.task.status'
done
```

### Frontend Tests
1. Open your website
2. Type a query in any search input
3. Press ENTER → fullscreen chat overlay opens with your query
4. Agent responds with markdown, code blocks, and links
5. Click a link → chat collapses to bottom bar, page navigates
6. Click expand on bar → chat returns to fullscreen
7. Close browser, reopen → bar auto-appears with previous conversation

### Security Tests
```bash
# XSS attempt — should be sanitized
curl -X POST https://<worker-url>/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "message/send",
    "id": 1,
    "params": {
      "message": {
        "role": "user",
        "parts": [{"type": "text", "text": "<script>alert(1)</script>Hello"}]
      }
    }
  }'

# Invalid JSON-RPC
curl -X POST https://<worker-url>/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "1.0", "method": "test"}'
# Expected: {"error": {"code": -32600, "message": "Invalid Request..."}}
```


