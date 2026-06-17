# Widget Spec: Broprint.js Visitor Identity Integration

> **For:** A2A Agent Widget Builder (AI Coder)
> **Priority:** High — Chat history and AI suggestions are broken without this
> **Date:** June 17, 2026

---

## The Problem

The widget components (`ChatApp.tsx`, `useHeroSuggestions.ts`) currently generate visitor IDs using a **random string** stored in `motherbrain_widget_visitor_id`:

```ts
// CURRENT (broken) — useHeroSuggestions.ts + ChatApp.tsx
const VISITOR_KEY = "motherbrain_widget_visitor_id";

function getOrCreateVisitorId(): string {
  const existing = localStorage.getItem(VISITOR_KEY);
  if (existing) return existing;
  const id = `w-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  localStorage.setItem(VISITOR_KEY, id);
  return id;
}
```

This ID is **not deterministic** — it's random. It doesn't match the website's existing Broprint.js fingerprinting system. This causes:

1. **Chat history doesn't persist** — The A2A endpoint stores conversations keyed by `visitor_id` in Supabase. A random ID means a visitor's history is lost between sessions if localStorage is cleared, or if they visited the site before via a different chat system.
2. **"Continue paused conversation" button doesn't detect returning visitors** — It checks `motherbrain_widget_visitor_id`, but visitors who previously chatted via the website have their ID stored as `motherbrain_visitor_id` (Broprint.js format).
3. **AI suggestions inconsistent** — The `visitor/suggestions` endpoint uses the visitor_id to personalize suggestions. A random ID means no personalization.
4. **Per-visitor rate limiting is ineffective** — The A2A endpoint rate-limits per `visitor_id`. Random IDs bypass this.

## The Fix

Replace the random ID generator with **Broprint.js fingerprinting**, using the **same localStorage key** as the website (`motherbrain_visitor_id`).

### 1. Add Broprint.js dependency

```bash
npm install @rajesh896/broprint.js
```

### 2. Create shared visitor identity module

Create `src/visitor-identity.ts` in the widget (or update the existing `getOrCreateVisitorId()` in both `ChatApp.tsx` and `useHeroSuggestions.ts`):

```ts
import { getCurrentBrowserFingerPrint } from "@rajesh896/broprint.js";

const STORAGE_KEY = "motherbrain_visitor_id";        // PRIMARY — matches website
const LEGACY_KEY = "motherbrain_widget_visitor_id";  // backward compat

let cachedVisitorId: string | null = null;

export async function getVisitorId(): Promise<string> {
  // Return cached value if available
  if (cachedVisitorId) return cachedVisitorId;

  // 1. Check the main localStorage key (matches website's Broprint.js ID)
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      cachedVisitorId = stored;
      return stored;
    }
  } catch {
    /* localStorage blocked */
  }

  // 2. Backward compat: check old widget key (migrate to new key)
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      localStorage.setItem(STORAGE_KEY, legacy);
      cachedVisitorId = legacy;
      return legacy;
    }
  } catch {
    /* localStorage blocked */
  }

  // 3. Generate new fingerprint via Broprint.js
  try {
    const fingerprint = await getCurrentBrowserFingerPrint();
    const visitorId = `vid_${fingerprint}`;
    localStorage.setItem(STORAGE_KEY, visitorId);
    cachedVisitorId = visitorId;
    return visitorId;
  } catch {
    // 4. Fallback: canvas/audio blocked (e.g., Comet by Perplexity, Tor)
    try {
      const fallbackId = `vid_${crypto.randomUUID().replace(/-/g, "")}`;
      localStorage.setItem(STORAGE_KEY, fallbackId);
      cachedVisitorId = fallbackId;
      return fallbackId;
    } catch {
      // 5. Final fallback
      const rawId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      const fallbackId = `vid_${rawId}`;
      localStorage.setItem(STORAGE_KEY, fallbackId);
      cachedVisitorId = fallbackId;
      return fallbackId;
    }
  }
}
```

### 3. Update `ChatApp.tsx`

Replace the synchronous `getOrCreateVisitorId()` with the async `getVisitorId()`:

```ts
// BEFORE (line ~59)
const VISITOR_KEY = "motherbrain_widget_visitor_id";
// ... getOrCreateVisitorId() ...

// AFTER
import { getVisitorId } from "./visitor-identity";

// Inside the component:
const visitorIdRef = useRef<string | null>(null);

// Load visitor ID on mount
useEffect(() => {
  getVisitorId().then(id => {
    visitorIdRef.current = id;
    // Now safe to fetch history
    if (initialQuery) {
      handleSend(initialQuery);
    }
  });
}, []);
```

**Important:** The `visitor_id` must be resolved BEFORE:
- Fetching chat history (`fetchHistory()`)
- Sending a message (`sendMessage` — goes in `params.metadata.visitor_id`)
- The `visitor/suggestions` call in `useHeroSuggestions`

### 4. Update `useHeroSuggestions.ts`

```ts
// BEFORE (line ~10, ~13-23)
const VISITOR_KEY = "motherbrain_widget_visitor_id";
function getOrCreateVisitorId(): string { ... }

// AFTER
import { getVisitorId } from "./visitor-identity";

// Inside the fetch:
const res = await fetch(endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    method: "visitor/suggestions",
    id: Date.now(),
    params: { visitor_id: await getVisitorId() },  // ← async
  }),
});
```

### 5. Update `HeroSearchHost.tsx`

Add optional `visitorId` prop for cases where the integrator already has a visitor ID:

```tsx
export interface HeroSearchHostProps {
  // ... existing props ...
  /** Optional: pass a pre-generated visitor ID. If omitted, generates via Broprint.js. */
  visitorId?: string;
}
```

If `visitorId` is passed, forward it to `useHeroSuggestions`. If not, the hook generates its own.

### 6. Preview mode override

The A2A Agent invention's Preview screen uses custom IDs like `preview-1780657393931-bd781z`. These should work by:

- Setting `localStorage.setItem("motherbrain_visitor_id", "preview-...")` before mounting the widget
- OR passing `visitorId="preview-..."` as a prop to `HeroSearchHost` / `ChatApp`

The `getVisitorId()` function checks localStorage first, so a preview ID set in localStorage will be used automatically.

---

## What NOT to Change

- The A2A endpoint (`a2a.motherbrain.app`) — it already works correctly with any `visitor_id` format
- The Supabase schema — `visitor_id` column already exists on `tasks` and `task_messages` tables
- The `visitor/suggestions` and `visitor/history` JSON-RPC methods — they work as-is

## Data Preservation

**No data will be lost.** Here's why:

1. The website already stores `motherbrain_visitor_id` = `vid_<fingerprint>` via Broprint.js
2. The widget will read the same key → same ID → same Supabase history
3. Broprint.js is deterministic → same browser always gets the same fingerprint
4. Backward compat: old `motherbrain_widget_visitor_id` values are migrated to the new key

## Files to Change in the Widget Bundle

| File | Change |
|------|--------|
| `package.json` | Add `@rajesh896/broprint.js` dependency |
| `src/visitor-identity.ts` | **NEW** — shared `getVisitorId()` module |
| `src/ChatApp.tsx` | Replace `getOrCreateVisitorId()` → `getVisitorId()` (async) |
| `src/useHeroSuggestions.ts` | Replace `getOrCreateVisitorId()` → `getVisitorId()` (async) |
| `src/HeroSearchHost.tsx` | Add optional `visitorId` prop |
| `src/index.ts` | Export `getVisitorId` from visitor-identity.ts |
| `README.md` | Document Broprint.js dependency |

## Fallback Chain (Same as Website)

```
Broprint.js (canvas + audio fingerprint)
  ↓ fails
crypto.randomUUID()
  ↓ fails
Date.now() + Math.random()
```

All formats use the `vid_` prefix.
