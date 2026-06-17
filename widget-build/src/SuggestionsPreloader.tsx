// ── Suggestions Preloader — invisible background fetch ───────────────────
// Ensures AI suggestion prompts are generated + cached in localStorage the
// FIRST time a visitor lands. Renders nothing — it only triggers a fetch when
// the cache is completely empty, so subsequent page loads are no-ops.
//
// USAGE (website side): mount ONCE in your global layout (root App / layout
// component) so it runs on every page. Pair with <HeroSearchHost> (or
// useHeroSuggestions), which reads the populated cache.
//
//   <SuggestionsPreloader endpoint="https://a2a.motherbrain.app" />

import { useEffect } from "react";
import { getVisitorId } from "./visitor-identity";
import { fetchSuggestions, isCacheEmpty } from "./suggestion-cache";

export interface SuggestionsPreloaderProps {
  /** A2A JSON-RPC endpoint URL */
  endpoint: string;
  /** Optional pre-resolved visitor ID. If omitted, resolves via Broprint.js. */
  visitorId?: string;
}

/**
 * Invisible background component. Performs a one-time suggestion fetch on the
 * visitor's first landing (when the cache is empty), so the Hero Search is
 * ready the moment they open it. No-op on every subsequent page load.
 */
export function SuggestionsPreloader({
  endpoint,
  visitorId,
}: SuggestionsPreloaderProps) {
  useEffect(() => {
    let cancelled = false;

    // Only act when the cache is completely empty (first visit / cleared).
    // A non-empty cache means suggestions are already ready — do nothing.
    if (!isCacheEmpty()) return;

    (async () => {
      const id = visitorId || (await getVisitorId());
      if (cancelled) return;
      await fetchSuggestions(endpoint, id);
    })();

    return () => {
      cancelled = true;
    };
  }, [endpoint, visitorId]);

  return null;
}
