// ── Motherbrain A2A Widget — Component Exports ─────────────────────────
// Import these into your React/Vite/TypeScript project.
//
// import { HeroSearchElement, ChatApp, BrainIcon } from './motherbrain-widget'
//
// See README.md for integration guide.

// Hero Search — web component (vanilla TS, no React dependency)
// Registers <ne-hero-search> custom element when imported.
export { NeHeroSearchElement, registerHeroSearch } from "./HeroSearchElement";

// Hero Search Host — React wrapper that mounts <ne-hero-search>, fetches
// AI-generated suggestions, and shows the "Continue paused conversation" button.
// This is the recommended way to render the hero section on your website.
export { HeroSearchHost } from "./HeroSearchHost";
export type { HeroSearchHostProps } from "./HeroSearchHost";

// AI Suggestions hook — reads the persistent suggestion cache and fetches
// on demand if empty. Returns { suggestions, loading }.
export {
  useHeroSuggestions,
  invalidateHeroSuggestionsCache,
} from "./useHeroSuggestions";
export type {
  UseHeroSuggestionsOptions,
  UseHeroSuggestionsResult,
} from "./useHeroSuggestions";

// Suggestions preloader — invisible component that generates + caches the
// first batch of AI prompts on a visitor's first landing. Mount once in your
// site's global layout so it runs on every page.
export { SuggestionsPreloader } from "./SuggestionsPreloader";
export type { SuggestionsPreloaderProps } from "./SuggestionsPreloader";

// Suggestion cache — persistent localStorage store with used-tracking and a
// 24-item cap. Used by the preloader + hook; useful for custom UIs.
export {
  fetchSuggestions,
  getUnusedSuggestions,
  getAllSuggestions,
  unusedCount,
  isCacheEmpty,
  canGenerateMore,
  addBatch,
  markSuggestionUsed,
  clearSuggestionCache,
} from "./suggestion-cache";
export type { CachedSuggestion } from "./suggestion-cache";

// Visitor identity — Broprint.js fingerprinting (shared with the website).
// Resolves the same `motherbrain_visitor_id` localStorage key so widget
// visitors keep their chat history across sessions.
export {
  getVisitorId,
  isReturningVisitor,
  clearVisitorId,
} from "./visitor-identity";

// Chat overlay — React component (fullscreen chat UI)
// Self-contained: includes markdown rendering, visitor tracking, history loading.
export { ChatApp } from "./ChatApp";
export type { ChatAppProps } from "./ChatApp";

// Supporting exports
export { renderMarkdown, sanitizeHtml, escapeHtml } from "./markdown";
export { BrainIcon } from "./BrainIcon";
