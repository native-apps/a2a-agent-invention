# Mother Brain A2A Widget

React/TypeScript components for deploying an A2A Agent Chat UI + Hero Search on your website.

## Quick Start (Recommended)

Use `HeroSearchHost` — it handles everything: mounting the search bar, fetching AI-generated suggestions, and showing the "Continue paused conversation" button.

```tsx
import { HeroSearchHost, ChatApp, SuggestionsPreloader } from './motherbrain-widget/src/index';
import { useEffect, useState } from 'react';

function HeroSection() {
  const [chatOpen, setChatOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<any[]>([]);

  return (
    <>
      {/* Preload AI suggestions on first landing (mount once globally) */}
      <SuggestionsPreloader endpoint="https://a2a.motherbrain.app" />

      {!chatOpen && (
        <HeroSearchHost
          endpoint="https://a2a.motherbrain.app"
          agentDescription="Ask me anything about Mother Brain"
          gradientColor1="#00dc82"
          gradientColor2="#a78bfa"
          branding="Powered by Mother Brain"
          onSubmit={(q) => { setQuery(q); setChatOpen(true); }}
          onOpenChat={() => setChatOpen(true)}
          messageCount={messages.length}
          lastMessagePreview={messages[messages.length - 1]?.text}
        />
      )}
      {chatOpen && (
        <ChatApp
          endpoint="https://a2a.motherbrain.app"
          agentName="Mother"
          initialQuery={query}
          onClose={() => setChatOpen(false)}
        />
      )}
    </>
  );
}
```

This gives you the **exact same experience** as the Mother Brain A2A Agent Preview screen:
- AI-generated typewriter suggestions (preloaded on first landing, cached in `localStorage`)
- No hardcoded placeholder prompts — shows a **"Thinking…"** indicator until suggestions are ready
- Clicked prompts are tracked as "used" (capped at 24 total per visitor to bound AI token spend)
- "Continue paused conversation" button when chat history exists
- Octagonal SVG search input with responsive geometry (Shadow DOM + ResizeObserver)
- Custom gradient colors on the stroke and brain icon

## Components

### `<HeroSearchHost />` — All-in-One Hero Section (Recommended)

React wrapper that mounts `<ne-hero-search>`, shows a **clickable suggestion dropdown** below the search (used prompts dimmed, "Generate new suggestions" action), handles gradient colors, and shows the continue button.

**Dropdown behavior:**
- Lists cached AI prompts below the search — click one to send it
- Used prompts are **dimmed + disabled** (with a ✓) so visitors can track what they've tried
- **"↻ Generate new suggestions"** appends a new batch (12 more), hidden once the 24-prompt cap is reached
- When all prompts are used and the cap isn't hit, a new batch is fetched automatically
- Shows **"Thinking…"** while the list is empty/loading

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `endpoint` | string | required | A2A JSON-RPC endpoint URL (for AI suggestions) |
| `agentDescription` | string | — | Shown above the search bar |
| `logoUrl` | string | — | Custom logo URL (passed to BrainIcon) |
| `visitorId` | string | — | Pre-resolved visitor ID (else resolves via Broprint.js) |
| `onSubmit` | function | required | Called with the user's query (typing or clicking a prompt) |
| `onOpenChat` | function | — | Called when user clicks "Continue paused conversation" |
| `messageCount` | number | `0` | Shows continue button when > 0 |
| `lastMessagePreview` | string | — | Preview text in the continue button |
| `gradientColor1` | string | `"#00dc82"` | Stroke + brain icon top color |
| `gradientColor2` | string | `"#a78bfa"` | Stroke + brain icon bottom color |
| `branding` | string | `"Powered by Mother Brain"` | Footer text |
| `style` | CSSProperties | — | Override for the host container style. Merged on top of the defaults (spread last), so you can override `backgroundColor`, `padding`, `minHeight`, etc. without the bundle forcing layout. |

> **Note:** `agentName` is **not** a prop on `HeroSearchHost` — the agent name comes from the Worker's Agent Card. (`agentName` is still a prop on `<ChatApp />`, where it's used for display text.)

### `<SuggestionsPreloader />` — Background Suggestion Generator (Recommended)

Invisible component that generates the first batch of AI prompts and caches them in `localStorage` the **moment a visitor lands**. Mount it **once** in your site's global layout (root App / layout) so it runs on every page. It renders nothing and only fetches when the cache is empty, so subsequent page loads are no-ops — this makes the Hero Search instant when opened.

```tsx
import { SuggestionsPreloader } from './motherbrain-widget/src/index';

// In your global layout:
<SuggestionsPreloader endpoint="https://a2a.motherbrain.app" />
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `endpoint` | string | required | A2A JSON-RPC endpoint URL |
| `visitorId` | string | — | Pre-resolved visitor ID (else resolves via Broprint.js) |

### `<ne-hero-search>` — Hero Search Web Component

Octagonal SVG search input with AI typewriter suggestions. Pure vanilla TS (no React dependency). Uses Shadow DOM + ResizeObserver for responsive geometry.

**Usage (low-level):**
```tsx
import { registerHeroSearch } from './motherbrain-widget/src/index';

registerHeroSearch();

// Then use it in JSX:
<ne-hero-search gradient-color-1="#00dc82" gradient-color-2="#a78bfa" />
```

**Events:**
- `hero-search-submit` — User pressed Enter or clicked brain icon. `detail: { query: string }`

**Methods:**
- `element.setSuggestions(string[])` — Set custom typewriter suggestions

### `useHeroSuggestions()` — AI Suggestions Hook

React hook that reads AI suggestions from the persistent `localStorage` cache (populated by `<SuggestionsPreloader>`) and fetches on demand if the cache is empty. Returns `{ suggestions, loading }`.

```tsx
import { useHeroSuggestions } from './motherbrain-widget/src/index';

function MyComponent() {
  const { suggestions, loading } = useHeroSuggestions({
    endpoint: 'https://a2a.motherbrain.app',
  });

  // Show "Thinking…" while empty/loading, then pass to the element:
  // element.setSuggestions(suggestions)
}
```

The backend (`visitor/suggestions`) returns the prompts (currently 12); the
widget does **not** pass a count. The cache caps at **24** total per visitor
(2 batches). Clicked prompts are marked used via `markSuggestionUsed()`.

### `<ChatApp />` — React Chat Component

Fullscreen chat overlay with markdown rendering, visitor tracking, conversation history, and streaming responses.

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `endpoint` | string | required | A2A JSON-RPC endpoint URL |
| `agentName` | string | `"Mother"` | Display name |
| `agentDescription` | string | — | Shown in hero screen |
| `branding` | string | `"Powered by Mother Brain"` | Footer text |
| `logoUrl` | string | — | Custom logo URL |
| `initialQuery` | string | — | Pre-fills and sends a query on mount |
| `onClose` | function | — | Called when user clicks close (✕) |
| `onMinimize` | function | — | Called when user clicks minimize (—). Parent should hide ChatApp and show the hero/bar view |

## Manual Wiring (Hero Search → Chat)

If you prefer to use the raw web component instead of `HeroSearchHost`:

```tsx
import { registerHeroSearch, ChatApp, useHeroSuggestions } from './motherbrain-widget/src/index';
import { useEffect, useRef, useState } from 'react';

registerHeroSearch();

function HeroSection() {
  const [chatOpen, setChatOpen] = useState(false);
  const [query, setQuery] = useState('');
  const heroRef = useRef<HTMLElement>(null);

  const suggestions = useHeroSuggestions({
    endpoint: 'https://a2a.motherbrain.app',
    agentName: 'Mother',
  });

  useEffect(() => {
    const handler = (e: CustomEvent) => {
      if (e.detail?.query) {
        setQuery(e.detail.query);
        setChatOpen(true);
      }
    };
    document.addEventListener('hero-search-submit', handler as EventListener);
    return () => document.removeEventListener('hero-search-submit', handler as EventListener);
  }, []);

  useEffect(() => {
    const el = heroRef.current as any;
    if (el?.setSuggestions) el.setSuggestions(suggestions);
  }, [suggestions]);

  return (
    <>
      <ne-hero-search ref={heroRef} gradient-color-1="#00dc82" gradient-color-2="#a78bfa" />
      {chatOpen && (
        <ChatApp
          endpoint="https://a2a.motherbrain.app"
          agentName="Mother"
          initialQuery={query}
          onClose={() => setChatOpen(false)}
        />
      )}
    </>
  );
}
```

## FAB / Menu Integration (Website-Specific)

The bundle ships **only** the Hero Search + Chat components — there is **no floating action button (FAB)** and no auto-mounting behavior. How the Hero Search is surfaced on your site is entirely up to you:

- **Typical install:** Place `<HeroSearchHost />` directly on your home page (or any page) where you want the search to appear. Most sites do this and never need a FAB.
- **motherbrain.app (our own site):** We surface the Hero Search from a fullscreen menu and wire the menu's brain icon (the bar `BrainIcon`) to open that menu. That brain-icon → menu wiring lives in the **website's own code** — it is intentionally **not** part of the bundle. So if you're integrating the exported widget and notice the brain icon doesn't open anything on its own, that's expected: the icon is decorative inside the bundle, and any click handling is the consuming site's responsibility.

If you want FAB-style behavior, mount `<HeroSearchHost />` (or `<ChatApp />`) on a button click in your own app — the bundle won't do it for you.

## Dependencies

- React 18+
- ReactDOM 18+
- [@rajesh896/broprint.js](https://www.npmjs.com/package/@rajesh896/broprint.js) — deterministic canvas+audio fingerprinting for visitor identity

The widget resolves a visitor ID via Broprint.js and stores it in
`localStorage` under `motherbrain_visitor_id` — the **same key the website
uses** — so chat history, "continue paused conversation", per-visitor rate
limiting, and AI suggestion personalization all stay consistent across
sessions. Fallback chain: Broprint.js → `crypto.randomUUID()` →
`Date.now()+Math.random()`.

## Files

```
motherbrain-widget/
├── src/
│   ├── index.ts               ← Entry point (re-exports everything)
│   ├── HeroSearchHost.tsx     ← React hero section wrapper (recommended)
│   ├── SuggestionsPreloader.tsx ← Invisible background suggestion fetcher
│   ├── HeroSearchElement.ts   ← <ne-hero-search> web component
│   ├── useHeroSuggestions.ts  ← AI suggestions hook (reads cache + fetches)
│   ├── suggestion-cache.ts    ← Persistent suggestion store (used-tracking, 24 cap)
│   ├── visitor-identity.ts    ← Broprint.js visitor ID (shared with website)
│   ├── ChatApp.tsx            ← React chat overlay component
│   ├── BrainIcon.tsx          ← Brain SVG logo
│   └── markdown.ts            ← Custom markdown→HTML renderer
├── package.json
├── tsconfig.json
└── README.md
```
