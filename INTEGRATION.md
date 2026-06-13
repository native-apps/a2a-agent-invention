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

# Agent Card discovery
curl https://<your-worker-url>/.well-known/agent.json

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

### 3a. Copy Frontend Files
Copy the `frontend/` directory into your React project:

```
your-project/src/
├── services/
│   ├── a2a.ts              ← Copy from bundle
│   └── visitor-identity.ts ← Copy from bundle
├── context/
│   └── ChatContext.tsx      ← Copy from bundle
├── components/
│   └── ChatOverlay.tsx      ← Copy from bundle
```

### 3b. Install Frontend Dependencies
```bash
npm install react-markdown remark-gfm lucide-react @rajesh896/broprint.js
```

### 3c. Add Tailwind Theme
Merge the colors and animations from `frontend/styles/tailwind-config.js` into your `tailwind.config.js`. At minimum, add these color mappings:

```js
// In tailwind.config.js → theme.extend.colors:
"neon-green": "rgb(var(--neon-green-rgb) / <alpha-value>)",
"hot-pink": "rgb(var(--hot-pink-rgb) / <alpha-value>)",
"blood-orange": "rgb(var(--blood-orange-rgb) / <alpha-value>)",
"deep-void": "rgb(var(--deep-void-rgb) / <alpha-value>)",
"dark-matter": "rgb(var(--dark-matter-rgb) / <alpha-value>)",
"neural-node": "rgb(var(--neural-node-rgb) / <alpha-value>)",
```

### 3d. Add CSS Variables
Add the contents of `frontend/styles/chat-theme.css` to your global CSS file (typically `src/index.css`). The `:root` block defines the dark theme, `.light` defines light mode overrides.

### 3e. Update A2A Endpoint URL
In `services/a2a.ts`, update the endpoint URL:
```typescript
const A2A_ENDPOINT = "https://<your-worker-url>";
```

### 3f. Add ChatProvider to App Root
Wrap your app's router with `ChatProvider` so chat state persists across page navigation:

```tsx
// src/App.tsx
import { ChatProvider } from "@/context/ChatContext";
import { ChatOverlay } from "@/components/ChatOverlay";

function App() {
  return (
    <ChatProvider>
      <BrowserRouter>
        <Routes>
          {/* Your routes */}
        </Routes>
      </BrowserRouter>
      {/* Hero Search: any search input → ENTER → fullscreen chat */}
      <ChatOverlay />
    </ChatProvider>
  );
}
```

**Important**: `ChatProvider` must wrap `BrowserRouter` (not be inside it) so chat state survives page navigation.

### 3g. Hero Search Hook

Hero Search lets any search input on the page open the fullscreen chat when the user presses ENTER. Use the `useChat()` hook to wire this up:

```tsx
// Hero Search — hook into ANY search input on the page
import { useChat } from "@/context/ChatContext";

function SearchBar() {
  const { startChat } = useChat();
  
  return (
    <input
      type="text"
      placeholder="Search or ask anything..."
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target.value.trim()) {
          e.preventDefault();
          startChat(e.target.value.trim()); // Opens fullscreen chat with query
        }
      }}
    />
  );
}
```

**"Ask Mother" button pattern** — show a fallback button when search returns no results:

```tsx
{searchResults.length === 0 && query && (
  <button onClick={() => startChat(query)}>
    Ask Mother ⚡
  </button>
)}
```

### Hero Search Architecture

**Hero Search (Hero ⚡️earch)** is a unified Search/Chat experience that replaces the traditional "floating chat widget" approach.

- When a user types in **any** search input and hits **ENTER**, the fullscreen Chat UI opens.
- Their search query becomes the first message to the AI agent.
- An **"Ask Mother"** button appears when no search results are found — clicking it opens the chat with the current query.
- The chat UI is a **fullscreen overlay**, not a corner widget.
- When the user clicks a link inside the chat, the chat **collapses to a full-width bottom bar** so the user can browse the page.
- Clicking the expand button on the bar returns the chat to fullscreen.
- The bottom bar auto-appears on revisit if a conversation is still active.

### 3h. BrainIcon Dependency
`ChatOverlay.tsx` imports `BrainIcon` from `./svg/BrainIcon`. Either:
- Copy your BrainIcon SVG component into your project, or
- Replace the import with any icon (e.g., from lucide-react)

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
Edit `frontend/styles/chat-theme.css` → `:root` variables:
- `--neon-green` / `--neon-green-rgb` — Primary accent
- `--hot-pink` / `--hot-pink-rgb` — Secondary accent
- `--deep-void` / `--deep-void-rgb` — Chat background

Then update `tailwind-config.js` color names to match.

### Agent Logo
The chat UI displays a logo in the header and bottom bar.

- **Default**: Mother Brain brain icon (lucide `Brain` SVG paths rendered by the `BrainIcon` component)
- **Custom logo**: set `logoUrl` in the invention settings
- **Supported formats**: SVG, PNG, JPG, ICNS — either uploaded files or remote URLs
- **Storage**: the logo is stored as a data URL (for uploads) or remote URL in the config
- **Rendering**: the `BrainIcon` component in the frontend checks for `logoUrl` and renders the custom logo when set, falling back to the default brain SVG

```tsx
// Example: BrainIcon with custom logo support
function BrainIcon({ logoUrl }: { logoUrl?: string }) {
  if (logoUrl) {
    return <img src={logoUrl} alt="Agent" className="h-6 w-6" />;
  }
  // Default: Mother Brain brain SVG
  return (
    <svg viewBox="0 0 24 24" ...>
      {/* lucide Brain paths */}
    </svg>
  );
}
```

### Changing the Agent Card
Edit `backend/agent-card.json`:
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
curl https://<worker-url>/.well-known/agent.json

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

## Step 6: Future — Web Component (Custom Element)

Hero Search mode — wrap the Chat UI as a framework-agnostic Custom Element:

```html
<motherbrain-chat
  endpoint="https://a2a.yourdomain.com"
  skill="product-info"
  theme="dark"
  hero-search="true"
></motherbrain-chat>

<script src="https://cdn.yourdomain.com/motherbrain-chat.js"></script>
```

This would involve:
1. Bundling React + components with a shadow DOM wrapper
2. Accepting config via HTML attributes
3. Emitting custom events (`chat-open`, `chat-close`, `message-sent`)
4. Styling isolated within the shadow DOM
5. Publishing to CDN (e.g., unpkg, jsdelivr)

This is the eventual goal — the current bundle provides all the pieces needed to build it.
