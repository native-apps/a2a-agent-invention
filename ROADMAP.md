# A2A Agent Invention — Roadmap & Feature Plan

> Last updated: 2026-06-09  
> Location: `~/.mother-brain/inventions/a2a-agent`  
> Repo: `https://github.com/native-apps/a2a-agent-invention`  
> Distribution: GitHub + MegaS3 Bucket

---

## Sprint 0: Ship Prep 🚀 *(current)*

### ✅ Completed
- [x] Broprint.js bundled inline (canvas + audio fingerprinting)
- [x] Gradient brain logo (green → purple, full SVG both hemispheres)
- [x] Chat history persistence (async visitor ID resolution, auto-load on connect)
- [x] Bar mode auto-show on history load + `chat-bar-show` event
- [x] Clickable 40px brain icon in bar + LED ping indicator
- [x] Split actions: `close-bar` hides, `expand` opens, `menu` dispatches event
- [x] AI Agent prompt updated with events, bar mode, FAB integration
- [x] Build → Download pipeline working
- [x] Custom events: `chat-bar-show`, `chat-bar-hide`, `chat-menu-request`, `chat-open`, `chat-close`

### ⬜ Remaining
- [ ] Move to own GitHub repo: `https://github.com/native-apps/a2a-agent-invention`
- [ ] Host on MegaS3 bucket for cloud install
- [ ] Verify works from `~/.mother-brain/inventions/a2a-agent` (canonical location)
- [ ] Copy invention files to canonical location
- [ ] Update server path resolution for canonical location
- [ ] Export A2A-related memories to markdown for new project
- [ ] Remove from Mother Brain source tree after verification

---

## Sprint 1: Knowledge Base Packing

Pack files from Mother's Knowledge Base (Obsidian vault) into the Cloudflare Worker on deploy.

### Files to Pack
| File | Path | Purpose |
|------|------|---------|
| **SOUL.md** | `~/Native Apps Dev/the-mother-brain/SOUL.md` | Mother's personality, tone, values |
| **SKILLS.md** | `~/Native Apps Dev/the-mother-brain/SKILLS.md` | Capabilities, tool reference |
| **Security.md** | `~/Native Apps Dev/the-mother-brain/Private/🔒 Mother — Internal Security Directives (PRIVATE).md` | Internal security directives |
| **Vocabulary.md** | `~/Native Apps Dev/the-mother-brain/Knowledge Base/Vocabulary.md` | Terminology reference |

### Tasks
- [ ] Evaluate CF Worker size limits (10MB paid plan)
- [ ] Build packer script into deploy flow
- [ ] Security doc handling: PRIVATE — never in client bundle or public APIs
- [ ] SOUL.md → system prompt personality injection
- [ ] SKILLS.md → tool selection accuracy
- [ ] Update mechanism: rebuild Worker when docs change
- [ ] Additional docs to consider: Pricing.md, FAQ.md

### Key Files
- `inventions/a2a-agent/backend/src/task-handler.ts` — Worker build

---

## Sprint 2: Chat UI Improvements

### Tasks
- [ ] **Hero Search Web Component** — Package existing nativeapps.io component as `<motherbrain-hero-search>` custom element
- [ ] **Departure Mono font hosting** — Serve woff2 from motherbrain.app/fonts/
- [ ] **Custom logo upload + storage** — Store at `~/.mother-brain/inventions/a2a-agent/logo.*`
- [ ] **Tool call rendering investigation** — Only 2 show in Chat UI but Conversations shows many. Why?
- [ ] **Multi-agent A2A endpoint** — Sub-agent support (different personalities per worker)

### Key Files
- `inventions/a2a-agent/frontend/bundle/motherbrain-chat.js` — Web Component

---

## Sprint 3: CRM + Entities

Full CRM with visitor/user/agent profiles.

### Entity Types
| Type | Description | Key Fields |
|------|-------------|------------|
| **Visitors** | Anonymous via Broprint.js fingerprint | Visitor ID, message count, geo, dates |
| **Users** | Paid license holders | License status, conversion tracking |
| **AI Agents** | ChatGPT, Perplexity, etc. via A2A | Platform, capabilities, history |

### Tasks
- [ ] Entities screen component
- [ ] Visitor profile cards (fingerprint, messages, dates)
- [ ] User profiles with license tracking
- [ ] AI Agent profiles (platform, capabilities)
- [ ] Visitor-to-user conversion tracking (retain chat history)
- [ ] `@mention` visitor ID in Chat Panel
- [ ] Custom entity fields via Supabase schema additions

### Key Files
- `inventions/a2a-agent/crm/` — CRM views
- `inventions/a2a-agent/settings/` — Entity management UI

---

## Sprint 4: Website Indexing

### Tasks
- [ ] **Firecrawl integration** — Crawl website, build URL + page content index
- [ ] **Cheerio alternative** — User chooses crawler
- [ ] **Storage format** — Markdown files bundled into Worker
- [ ] **Website navigation by Mother** — Auto-navigate pages during conversations
- [ ] **MCP Server in Chat UI** — Mother controls website navigation

### Open Questions
- Can the Web Component navigate between website pages?
- Worker bundle size impact of indexed content?
- Update frequency for indexed pages?

---

## Sprint 5: Multi-Agent + Advanced

### Tasks
- [ ] Sub-Agent support (multiple AI personalities from one Mother Brain)
- [ ] Sub-Agent management UI (create, edit, delete, assign)
- [ ] Different system prompts, skills, knowledge per Sub-Agent
- [ ] Same Worker with different skill routing, or separate Workers

---

## Sprint 6: Invention Registry + Distribution

### Tasks
- [ ] Invention Uploader UI (accept zip/tar.gz in Inventions screen)
- [ ] Public registry on motherbrain.app (plugin marketplace)
- [ ] One-click install + auto-updates from registry
- [ ] GitHub repo URL install method
- [ ] Cerebellum recipe integration (`/mother setup A2A Agent` guided wizard)

---

## Bugs — Critical 🔴

| # | Bug | Severity | Status |
|---|-----|----------|--------|
| 1 | **Brainstorm mode adding random projects** — When enabled, random projects get linked that the user didn't select. A2A Agent tool calls showed queries from unrelated projects. | 🔴 Critical (security) | Unresolved |
| 2 | **Tool calls discrepancy** — Only 2 tool calls show in Chat UI but Conversations screen shows many. Likely: Chat UI only renders tool calls on the final agent message, Conversations shows all intermediate steps. | 🟡 Medium | Investigating |
| 3 | **MCP Tool security audit** — Need to verify only approved/restricted tools are exposed in the CF Worker A2A endpoint. | 🔴 Critical | Pending review |

---

## Security Tasks 🔒

| Task | Notes |
|------|-------|
| Brainstorm mode project isolation | Only user-selected projects accessible to any agent |
| A2A MCP tool whitelist audit | Verify only approved tools exposed in CF Worker |
| Rate limiting review | Prevent abuse of A2A endpoint |
| Security doc packing | PRIVATE handling — never in client-side code |
| Visitor ID integrity | Broprint.js must produce identical hashes to website |

---

## Invention Protocol — How Mother Brain Loads Extensions

### Canonical Location
```
~/.mother-brain/inventions/a2a-agent/
```

### Required Structure
```
a2a-agent/
├── config.json              ← Invention metadata + settings (required)
├── README.md                ← Documentation
├── ROADMAP.md               ← This file
├── backend/
│   ├── src/
│   │   └── task-handler.ts  ← Cloudflare Worker source
│   └── schema/
│       ├── 001_initial.sql
│       ├── 002_visitor_sessions.sql
│       ├── 003_visitor_total_recall.sql
│       └── 004_realtime.sql
├── frontend/
│   ├── bundle/
│   │   └── motherbrain-chat.js  ← Web Component template
│   ├── components/
│   │   └── ChatOverlay.tsx
│   ├── context/
│   │   └── ChatContext.tsx
│   ├── services/
│   └── styles/
├── settings/
│   ├── A2aAgentSettings.tsx     ← Settings panel (registered in InventionsView)
│   ├── A2aChatPreview.tsx
│   └── A2aReadme.tsx
├── crm/
│   └── A2aCrmView.tsx
├── standalone/
│   ├── A2aStandalone.tsx
│   └── InventionStandalone.tsx
├── scripts/
│   └── build-widget.cjs         ← Build script for motherbrain-chat.js
└── recipes/
    ├── a2a-setup.md
    └── a2a-widget-deploy.md
```

### config.json Schema
```typescript
interface InventionConfig {
  id: string;                    // "a2a-agent"
  name: string;                  // "A2A Agent"
  description: string;
  type: InventionType;           // "a2a-agent" | "data-primer" | etc.
  version: string;
  enabled: boolean;
  installedAt: string;           // ISO date
  updatedAt: string;             // ISO date
  projectIds: string[];          // Empty = global, specific = scoped
  settings: Record<string, any>; // Invention-specific flexible JSON
  database?: {
    provider: "sqlite" | "supabase" | "embedded-pg";
    collection?: string;
  };
  tools?: string[];              // MCP tools this invention registers
  routes?: string[];             // API routes this invention adds
  icon?: string;                 // lucide-react icon name
  author?: string;
  homepage?: string;
}
```

### Settings Component Registration
The settings component is registered in `InventionsView.tsx`:
```typescript
const INVENTION_SETTINGS_REGISTRY = {
  "a2a-agent": A2aAgentSettings,
};
```
The registry maps `config.type` → a React component that receives `{ invention, onUpdate }`.

### Server API Routes
- `GET /api/inventions` — List all inventions
- `GET /api/inventions/:id` — Get invention config
- `POST /api/inventions` — Create invention from template
- `PATCH /api/inventions/:id` — Update invention settings
- `DELETE /api/inventions/:id` — Delete invention
- `GET /api/inventions/a2a-agent/widget-template` — Serve motherbrain-chat.js template

### Inventions Store
All CRUD operations are in `lib/inventions-store.ts`. It reads/writes `config.json` from `~/.mother-brain/inventions/{id}/config.json`.

---

## Custom Events (dispatched by the Web Component)

| Event | When | Detail | Used by |
|-------|------|--------|---------|
| `chat-bar-show` | History loads & bar auto-shows, or minimize | `{ lastMessage: string \| null }` | Host site hides its FAB |
| `chat-bar-hide` | X button on bar clicked | — | Host site shows FAB again |
| `chat-menu-request` | Brain icon clicked in bar | — | Host site opens navigation |
| `chat-open` | Expand ↗ clicked | — | Host site hides FAB |
| `chat-close` | Chat overlay closed | — | Host site shows FAB |
| `message-sent` | User sends a message | `{ text }` | Analytics/tracking |
| `message-received` | Agent responds | `{ text }` | Analytics/tracking |

---

## Key Files Quick Reference

| File | Purpose |
|------|---------|
| `frontend/bundle/motherbrain-chat.js` | Web Component template (1,800+ lines) |
| `scripts/build-widget.cjs` | Build script — replaces defaults with user settings |
| `settings/A2aAgentSettings.tsx` | Settings panel UI (deploy, widget build, CRM) |
| `backend/src/task-handler.ts` | Cloudflare Worker (A2A protocol handler) |
| `backend/schema/` | Supabase SQL migrations (4 files) |
| `lib/inventions-store.ts` | Mother Brain plugin loading system |
