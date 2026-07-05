# A2A Agent Invention — Public Release Audit

**Created:** July 4, 2026
**Status:** Active checklist — must be complete before shipping to public customers

---

## How to Use This Checklist

Each item has:
- **Priority:** P0 (blocker), P1 (important), P2 (nice-to-have)
- **Status:** ✅ Done / ⚠️ Partial / ❌ TODO
- **Details:** What's hardcoded and what needs to change

---

## P0 — Blockers (Must Fix Before Ship)

### 1. ❌ Agent Card Preview Uses Hardcoded AGENT_CARD Constant
**File:** `settings/A2aAgentSettings.tsx` lines 253-300

The `renderAgentCard()` function displays a hardcoded `AGENT_CARD` constant:
```
name: "Mother"
description: "Mother Brain's intelligent support agent."
url: "https://a2a.motherbrain.app"
```

The JSON download at line 2483 correctly overrides with `settings.agentName`, but the **UI preview display** (lines 2368-2470) uses `AGENT_CARD.name`, `AGENT_CARD.description`, `AGENT_CARD.url` directly.

**Fix:** All preview display fields should use `settings.agentName || AGENT_CARD.name`, `settings.agentDescription || AGENT_CARD.description`, `settings.agentUrl || AGENT_CARD.url` — like the JSON download already does.

### 2. ❌ Agent Card Skills Are Hardcoded for Mother Brain
**File:** `settings/A2aAgentSettings.tsx` lines 266-300

Skills reference "Mother Brain features, pricing, licensing" etc. These are MB-specific.

**Fix:** 
- Skills should default to generic ones ("General Support", "Product Info", "Technical Help") 
- Users should be able to add/edit/customize skills in the settings UI
- Store custom skills in `settings.skills`
- The settings UI already has `settings.skills || AGENT_CARD.skills` for the JSON download — need to add a skill editor UI

### 3. ❌ DEFAULT_SETTINGS Has MB-Specific Defaults
**File:** `settings/A2aAgentSettings.tsx` lines 160-195

```typescript
agentName: "Mother",
agentDescription: "AI assistant powered by Mother Brain",
widgetBranding: "Powered by Mother Brain",
```

**Fix:** Change to generic defaults:
```typescript
agentName: "AI Assistant",
agentDescription: "AI assistant",
widgetBranding: "",
```

### 4. ❌ Backend Agent Card JSON (backend/src/agent-card.json)
**File:** `backend/src/agent-card.json`

Entire file is hardcoded for Mother Brain:
- `name: "Mother"`
- `description: "Mother Brain's intelligent support agent..."`
- `provider: { organization: "motherbrain.app", url: "motherbrain.app" }`
- All 5 skills reference Mother Brain by name

**Current state:** The Worker already overrides `name` and `description` dynamically via `getAgentCard()` in `index.ts`. But the static defaults are MB-specific. The deploy script cleans this for the public tarball, but the fallback when no Sub-Agent is selected shows "Mother".

**Fix:** The deploy script's `GENERIC_AGENT_CARD` (already implemented) replaces this for public tarballs. Verify the generic card is truly generic (name: "AI Assistant", no MB references).

### 5. ⚠️ Knowledge Base SOUL_MD / SKILLS_MD / SECURITY_DIRECTIVES
**File:** `backend/src/knowledge-base.ts`

The entire `SOUL_MD` (300+ lines) is Mother Brain specific. `SKILLS_MD` references motherbrain.app API endpoints. `SECURITY_DIRECTIVES` reference Mother Brain internals.

**Current state:** Deploy script blanks `SOUL_MD` and scrubs MCP API keys for public tarball. `SKILLS_MD` and `SECURITY_DIRECTIVES` are NOT cleaned.

**Fix:**
- Deploy script should also blank or genericize `SKILLS_MD` for public tarball
- `SECURITY_DIRECTIVES` should be generic (not reference Mother Brain internal paths/URLs)
- For the creator's deployment: these stay as-is (correct behavior)

### 6. ❌ Widget Deploy Snippet Has MB Defaults
**File:** `settings/A2aAgentSettings.tsx` `renderWidgetDeploy()`

```typescript
const endpoint = settings.agentUrl || "https://a2a.motherbrain.app";
const agentName = settings.agentName || "MOTHER";
const branding = settings.widgetBranding || "Powered by Mother Brain";
```

**Fix:** Change fallbacks to empty strings or generic values. Use `settings.agentName || "AI Assistant"`.

### 7. ❌ Preview Screen Defaults
**File:** `settings/A2aChatPreview.tsx` `getSettings()`

```typescript
agentDescription: "AI assistant powered by Mother Brain",
widgetBranding: "Powered by Mother Brain",
```

**Fix:** Generic defaults.

---

## P1 — Important (Should Fix Before Ship)

### 8. ⚠️ License Key System — Encore API Hardcoded
**Files:** `backend/src/license-resolver.ts`, `backend/src/device-resolver.ts`

Both call the Encore API at a configurable URL (`ENCORE_API_URL`). The URL itself is dynamic (good), but the **endpoint paths** (`/subscriptions/lookup`, `/auth/resolve-visitor-ids`) are hardcoded for the Mother Brain Encore backend.

**Assessment:** This is inherently MB-specific. Other users won't have the same API.

**Fix — Make it optional and documented:**
- License key resolution is already optional (graceful degradation when `ENCORE_API_URL` is not set) ✅
- Add documentation explaining the expected API contract so users can build their own compatible endpoint
- Consider a generic "license verification URL" setting where users provide their own API endpoint that accepts a license key and returns a visitor_id + customer_id
- Add to README: "License Key System (Optional) — Configure if you have a license key system. The API must accept GET /subscriptions/lookup?key=XXX and return { visitorId, customerId, ... }"

### 9. ❌ JWT Verification — MB-Specific JwtSecret
**Files:** `backend/src/jwt-session.ts`

The JWT verification uses a shared secret (`JWT_SECRET`) that's specific to Mother Brain's Encore auth system. Other users won't have this secret.

**Current state:** Already optional (fail-closed when not configured) ✅. When not set, anonymous + license key paths still work.

**Fix:** Document clearly:
- "JWT Verification (Optional) — Only configure if your website issues JWT session tokens. The Worker verifies them using HMAC-SHA256 with a shared secret."
- Add to README explaining the JWT claim structure expected (`sub` = customerId, `vid` = visitor_id, etc.)

### 10. ❌ Website MCP Tools — Hardcoded Endpoints
**File:** `backend/src/website-mcp.ts`

The 13 website tools call the MB website MCP server. Other users won't have these endpoints.

**Current state:** Already optional (graceful degradation when `MCP_BASE_URL` is not set) ✅

**Fix:** Document as optional feature. For public users, website tools won't be available unless they have their own MCP server.

### 11. ❌ README.md and Integration Guide
**File:** `README.md`, `INTEGRATION.md`

Both reference Mother Brain extensively. "Hello, what is Mother Brain?" example, MB-specific deployment steps, etc.

**Fix:** The deploy script already replaces motherbrain.app URLs with placeholders. Need to also genericize the prose content for the public tarball. Or create a separate public README.

### 12. ❌ A2aReadme.tsx (In-App README)
**File:** `settings/A2aReadme.tsx`

References "Mother Brain" throughout the in-app readme screen.

**Fix:** Genericize or make dynamic from settings.

---

## P2 — Nice to Have (Can Ship Without)

### 13. ⚠️ Supabase-Only Database Support
The invention only supports Supabase for chat history storage.

**Assessment:** Supabase is the best choice for a Cloudflare Worker (edge-compatible, generous free tier, Postgres-compatible). Adding other providers (PlanetScale, Turso, etc.) is a significant undertaking.

**Recommendation:** Document Supabase requirement clearly. Add to roadmap: "Support for additional database providers coming in a future version."

### 14. ❌ Customer ID System Documentation
The `customer_id` tracking assumes users have a numeric customer ID system (like Stripe/Encore). Other users may use UUIDs, strings, or different ID formats.

**Fix:** 
- Change `customer_id INTEGER` to `customer_id TEXT` in schema (more flexible) — or document that it must be an integer
- Add documentation explaining how the customer_id links work
- Add a "customer ID mapping guide" to the README

### 15. ❌ Default Suggestions Are MB-Specific
**File:** `settings/A2aChatPreview.tsx`

Default hero search suggestions reference Mother Brain:
```
"How does Mother Brain work?"
```

**Fix:** Genericize or generate dynamically from the agent's knowledge base.

### 16. ⚠️ Deploy Script MB-Specific Cleaning
**File:** `scripts/deploy-to-mega.cjs`

The `cleanMbSpecificFiles()` function is specifically designed for Mother Brain content. It works but is tightly coupled to our setup.

**Fix:** Rename to `cleanForPublic()` and make the cleaning rules more generic (strip any `mb_*` API keys, strip hardcoded URLs from specific files).

### 17. ❌ Config Description References Mother Brain
**File:** `config.json`

```json
"description": "Deploy an AI Agent from Mother Brain to your website..."
```

**Fix:** Genericize for public. Something like: "Deploy an AI Agent to your website via Hero Search. Visitors chat in real-time while the agent answers using your project's knowledge base."

---

## ✅ Already Dynamic (No Changes Needed)

### Broprint.js Visitor Tracking
- Fully dynamic, works for any website ✅
- visitor_id system is universal ✅

### Resizable Chat Panel
- No hardcoded values ✅
- Persists to localStorage ✅

### Widget Bundle Export
- Uses `settings.agentUrl` for endpoint ✅
- Uses `settings.agentName` for display ✅
- No hardcoded URLs in the bundle code ✅

### Dual-Path Authentication
- JWT verification: optional (when JWT_SECRET set) ✅
- License key resolution: optional (when ENCORE_API_URL set) ✅
- Anonymous visitor: always works ✅

### Cross-Device Chat
- Uses customer_id from JWT (optional) ✅
- Falls back to single visitor_id when no JWT ✅

### Entity Tracking
- Auto-detects type (visitor/customer/ai_bot) ✅
- Source auto-detected from request ✅

### Offline Fallback Mode
- Uses project Supabase directly when Gateway is down ✅
- All fallback config is optional ✅

### CRM View (Conversations)
- Fetches from Supabase using settings credentials ✅
- No hardcoded URLs ✅

---

## Action Plan

### Phase 1: P0 Fixes (Do Now)
1. Fix Agent Card preview to use settings values dynamically
2. Fix DEFAULT_SETTINGS to generic values
3. Fix widget deploy snippet fallbacks
4. Fix preview screen defaults
5. Add skill editor UI (basic — at minimum let users see/edit skills)
6. Verify deploy script generic agent card is truly generic

### Phase 2: P1 Fixes (Before Public Announcement)
7. Genericize README and Integration Guide for public tarball
8. Genericize A2aReadme.tsx
9. Add documentation for optional features (license keys, JWT, MCP tools)
10. Document Supabase requirement and customer_id system

### Phase 3: P2 Items (Post-Launch)
11. Add DB provider roadmap note
12. Change customer_id to TEXT (or document INTEGER requirement)
13. Clean up default suggestions
14. Refactor deploy script cleaning

---

## Notes

- **The deploy script is the key defense layer.** It already cleans config.json, agent-card.json, SOUL_MD, and README URLs for the public tarball. This means the PUBLIC version is mostly clean even if the repo has MB-specific defaults.
- **The LOCAL repo (for our use) SHOULD have MB-specific defaults** — that's our configuration. The deploy script handles the separation.
- **Settings fields drive everything.** When a user fills in the settings UI and deploys, their values override any defaults. The issue is when defaults bleed into the UI preview or the public tarball.
