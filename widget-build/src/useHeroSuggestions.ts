// ── AI-Generated Hero Search Suggestions ────────────────────────────────
// Reads AI suggestions from the persistent localStorage cache (populated by
// <SuggestionsPreloader> on first landing, or fetched on demand here).
//
// The backend (visitor/suggestions) returns the suggestions (currently 12);
// the widget does NOT pass a count. See suggestion-cache.ts for the cache,
// used-tracking, and the 24-item cap.
//
// Mirrors the logic in settings/A2aChatPreview.tsx (lines ~1389-1464).

import { useEffect, useState } from "react";
import {
  fetchSuggestions,
  getUnusedSuggestions,
  isCacheEmpty,
} from "./suggestion-cache";

export interface UseHeroSuggestionsOptions {
  /** A2A JSON-RPC endpoint URL */
  endpoint: string;
  /** Agent display name — kept for API compatibility */
  agentName?: string;
  /** Custom defaults shown until suggestions arrive (overrides "Thinking…" empty state) */
  defaults?: string[];
  /** Optional pre-resolved visitor ID (skips Broprint.js lookup) */
  visitorId?: string;
}

export interface UseHeroSuggestionsResult {
  /** Unused suggestion texts (fresh — ready to display in the typewriter). */
  suggestions: string[];
  /** True while resolving the visitor ID or fetching suggestions. */
  loading: boolean;
}

/**
 * React hook that reads AI suggestions from the localStorage cache and, if the
 * cache is empty, triggers a fetch (in case the preloader hasn't run yet).
 *
 * Returns `{ suggestions, loading }`. Callers should show a "Thinking…"
 * indicator while `loading` is true OR `suggestions` is empty.
 */
export function useHeroSuggestions({
  endpoint,
  defaults,
  visitorId,
}: UseHeroSuggestionsOptions): UseHeroSuggestionsResult {
  // Read the cache synchronously on first render → instant display when the
  // preloader has already populated it before the menu opens.
  const [suggestions, setSuggestions] = useState<string[]>(() => {
    const cached = getUnusedSuggestions();
    return cached.length > 0 ? cached : (defaults ?? []);
  });

  const [loading, setLoading] = useState<boolean>(() => {
    // Only "loading" if the cache is empty and no defaults were supplied.
    if (!isCacheEmpty()) return false;
    return !defaults || defaults.length === 0;
  });

  useEffect(() => {
    let cancelled = false;

    // Cache already populated (preloader did its job) — nothing to fetch.
    if (!isCacheEmpty()) {
      setSuggestions(getUnusedSuggestions());
      setLoading(false);
      return;
    }

    // Cache empty → fetch now (preloader may not have run, or this page is
    // the first mount). Coalesced by suggestion-cache to avoid duplicates.
    (async () => {
      try {
        const result = await fetchSuggestions(endpoint, visitorId);
        if (!cancelled) {
          if (result.length > 0) setSuggestions(result);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { suggestions, loading };
}

/**
 * Clear the suggestion cache (forces regeneration on next fetch).
 * Alias kept for backward compatibility; prefer clearSuggestionCache.
 */
export { invalidateHeroSuggestionsCache } from "./suggestion-cache";
