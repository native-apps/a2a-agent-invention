# Session Notes — 2026-06-15 — Build Widget Failure

## SESSION OUTCOME
**Build Widget rewrite = TOTAL FAILURE.** Hero Search does not render. Need new session to diagnose.

---

## WHAT WORKED (KEEP THESE — DEPLOYED & CONFIRMED)

### 1. Backend: Agent ignoring user messages — FIXED ✅
- **File:** `backend/src/task-handler.ts`
- **Bug:** `const fullMessage = conversationContext || userMessage;` — the `||` operator silently discarded the user's actual question whenever conversation context existed
- **Fix:** Removed redundant `conversationContext` loading entirely. User message is now passed directly as the `user` role message. `recallVisitorContext` handles all context (8 recent + 10 semantic vector search) in the system prompt.
- **Status:** Deployed to Cloudflare Worker. User confirmed "Good work! That fixed it!"

### 2. Backend: Task reuse for visitor_id — FIXED ✅
- **File:** `backend/src/index.ts`
- **Bug:** Every `message/send` without a `taskId` created a NEW task, splitting conversations
- **Fix:** When no `taskId` but `visitor_id` exists, look up and reuse the visitor's most recent task
- **Status:** Deployed to Cloudflare Worker

### 3. CRM: Group conversations by visitor_id — FIXED ✅
- **File:** `crm/A2aCrmView.tsx`
- **Bug:** CRM grouped conversations by `task_id`, showing each message as a separate conversation
- **Fix:** CRM now groups by `visitor_id`. `fetchMessages`, `loadMoreMessages`, real-time subscriptions, and click handlers all use `visitorId` instead of `taskId`.
- **Status:** Deployed in v1.1.26

### 4. Token efficiency — IMPROVED ✅
- Reduced chronological recall from 20 to 8 messages
- Removed redundant 20-message `conversationContext` loading (was duplicating `recallVisitorContext`)
- Architecture: user message (#1 priority) + 8 recent messages + 10 semantic vector matches

---

## WHAT FAILED (BUILD WIDGET — TOTAL REGRESSION) ❌

### The Problem
The v1.1.25 "Option B — Single Source of Truth" rewrite of `hero-search.js` broke the Hero Search widget completely. It does not render at all on the deployed website.

### Timeline
- **v1.1.22:** Hero Search worked, looked correct, but had stale nativeapps.io content (old taglines, amber/orange colors)
- **v1.1.25:** Complete rewrite of hero-search.js to extract from preview — **BROKE EVERYTHING**
- **v1.1.27:** Removed agent description text — too late, hero search already broken

### User's Report
- Hero Search is NOT showing up at all
- Continue Conversation button is missing
- Collapsed chat panel (bar mode) is totally broken
- Deployed widget looks NOTHING like the preview
- "IT LITERALLY LOOKS LIKE ABSOLUTELY NOTHING WAS UPDATED AT ALL"
- Chat UI overlay looks OK

### Prime Suspects for Root Cause
1. **PATH MISMATCH:** Build Widget fetches hero-search.js from `frontend/bundle/hero-search.js` (NO `/dist/`) but motherbrain-chat.js from `frontend/bundle/dist/motherbrain-chat.js` (HAS `/dist/`). The `/resource/` API endpoint may be serving the wrong file.
2. **Multiple out-of-sync copies:** hero-search.js exists in 4 locations:
   - `frontend/bundle/dist/hero-search.js` (the one I edited)
   - `frontend/bundle/hero-search.js` (the one Build Widget fetches!)
   - `frontend/bundle/hero-search-bundle/dist/hero-search.js`
   - `temp/hero-search.js`
3. **Invention not updated:** Mother Brain app may be serving cached/stale invention files
4. **Rewrite extraction errors:** The v1.1.25 extraction from React to vanilla JS may have structural issues

### What Was Lost
The pre-v1.1.25 hero-search.js was WORKING (rendered correctly, placed correctly) but had stale content. The rewrite threw away the working rendering to fix the content, and broke both.

---

## WHAT TO DO IN NEW SESSION
1. **DO NOT edit code yet** — diagnose first
2. Check what `/api/inventions/a2a-agent/resource/frontend/bundle/hero-search.js` actually serves
3. Compare the file paths between hero-search.js and motherbrain-chat.js in the Build Widget handler
4. Do a line-by-line comparison of dist hero-search.js against the preview
5. Consider: was the v1.1.22 hero-search.js (pre-rewrite) better? Can we recover it and just fix the stale content?
6. The goal: Hero Search renders correctly, matches preview, NO stale nativeapps.io content

## KEY FILES
- `settings/A2aChatPreview.tsx` — THE PREVIEW (source of truth)
- `frontend/bundle/dist/hero-search.js` — BROKEN deployed hero search
- `frontend/bundle/hero-search.js` — The file Build Widget ACTUALLY fetches (may be different!)
- `frontend/bundle/dist/motherbrain-chat.js` — Deployed chat widget (looks OK per user)
- `settings/A2aAgentSettings.tsx` — Build Widget button handler (line ~2128: `renderWidgetDeploy`)

## USER DIRECTIVE
"WE NEED A NEW SESSION. THIS REBUILD OF THE BUILD WIDGET FUNCTION WAS A TOTAL, TOTAL FAILURE. STORE MEMORY OF THIS MASSIVE FAILURE, AND WE START A NEW SESSION. DONT EDIT CODE YET. WE HAVE TO FIGURE OUT WHAT WENT WRONG FIRST."
