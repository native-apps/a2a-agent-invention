// ── Suggestion Cache — persistent localStorage store ────────────────────
// Manages AI-generated hero search suggestions with:
//   - Persistent storage (localStorage, never auto-expires)
//   - Per-prompt "used" tracking (dim/disable after click)
//   - Batch generation capped at MAX_TOTAL (24) to bound AI token spend
//   - Coalesced fetching (inflight promise) to avoid duplicate requests
//
// The backend (visitor/suggestions) controls the suggestion COUNT (currently
// 12). This module does not request a count — it stores whatever arrives and
// enforces the 24-item ceiling.

import { getVisitorId } from "./visitor-identity";

const STORAGE_KEY = "motherbrain_hero_suggestions";

/** Hard ceiling on total suggestions stored for a visitor (2 batches of 12). */
const MAX_TOTAL = 24;

export interface CachedSuggestion {
  text: string;
  used: boolean;
  /** ISO timestamp of the batch that produced this suggestion. */
  generatedAt: string;
}

interface SuggestionCache {
  suggestions: CachedSuggestion[];
  updatedAt: string;
}

/** In-flight fetch promise — coalesces concurrent callers to one request. */
let inflight: Promise<string[]> | null = null;

// ── Internal storage helpers ─────────────────────────────────────────────

function readCache(): SuggestionCache | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.suggestions)) return null;
    return parsed as SuggestionCache;
  } catch {
    return null;
  }
}

function writeCache(cache: SuggestionCache): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    /* localStorage blocked or full */
  }
}

// ── Reads ────────────────────────────────────────────────────────────────

/** All suggestions (used + unused). */
export function getAllSuggestions(): CachedSuggestion[] {
  return readCache()?.suggestions ?? [];
}

/** Unused suggestion texts (fresh — for typewriter / fresh display). */
export function getUnusedSuggestions(): string[] {
  return (readCache()?.suggestions ?? [])
    .filter((s) => !s.used)
    .map((s) => s.text);
}

/** Number of currently unused suggestions. */
export function unusedCount(): number {
  return (readCache()?.suggestions ?? []).filter((s) => !s.used).length;
}

/** True if the cache has no suggestions at all (never generated / cleared). */
export function isCacheEmpty(): boolean {
  const c = readCache();
  return !c || c.suggestions.length === 0;
}

/** True if another batch can be generated (total stored < MAX_TOTAL). */
export function canGenerateMore(): boolean {
  return (readCache()?.suggestions.length ?? 0) < MAX_TOTAL;
}

// ── Mutations ────────────────────────────────────────────────────────────

/**
 * Append a new batch of suggestions. De-dupes against existing entries and
 * respects the MAX_TOTAL cap. Does nothing if the cap is already reached.
 */
export function addBatch(texts: string[]): void {
  if (!Array.isArray(texts) || texts.length === 0) return;
  const cache = readCache() ?? {
    suggestions: [],
    updatedAt: new Date().toISOString(),
  };
  const existing = new Set(cache.suggestions.map((s) => s.text));
  const now = new Date().toISOString();
  const toAdd: CachedSuggestion[] = [];
  for (const text of texts) {
    if (cache.suggestions.length + toAdd.length >= MAX_TOTAL) break;
    if (typeof text !== "string" || existing.has(text)) continue;
    existing.add(text);
    toAdd.push({ text, used: false, generatedAt: now });
  }
  if (toAdd.length > 0) {
    cache.suggestions.push(...toAdd);
    cache.updatedAt = now;
    writeCache(cache);
  }
}

/**
 * Mark a suggestion as used (clicked/submitted).
 * Returns the updated unused count.
 */
export function markSuggestionUsed(text: string): number {
  const cache = readCache();
  if (!cache) return 0;
  let changed = false;
  for (const s of cache.suggestions) {
    if (s.text === text && !s.used) {
      s.used = true;
      changed = true;
    }
  }
  if (changed) writeCache(cache);
  return cache.suggestions.filter((s) => !s.used).length;
}

/** Clear the entire cache (forces regeneration on next fetch). */
export function clearSuggestionCache(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* localStorage blocked */
  }
  inflight = null;
}

// ── Fetch ────────────────────────────────────────────────────────────────

/**
 * Fetch suggestions from the backend and store them as a new batch.
 *
 * - Resolves the visitor ID via Broprint.js (unless provided).
 * - Coalesces concurrent calls onto a single network request.
 * - Respects MAX_TOTAL: no-ops (returns current unused) when capped.
 *
 * Returns the unused suggestion texts after storing.
 */
export async function fetchSuggestions(
  endpoint: string,
  visitorId?: string,
): Promise<string[]> {
  // At the cap — nothing to generate.
  if (!canGenerateMore()) return getUnusedSuggestions();

  // Coalesce concurrent callers.
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const id = visitorId || (await getVisitorId());
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "visitor/suggestions",
          id: Date.now(),
          params: { visitor_id: id },
        }),
      });
      if (!res.ok) return getUnusedSuggestions();
      const data = await res.json();
      const suggestions: unknown = data.result?.suggestions;
      if (Array.isArray(suggestions) && suggestions.length > 0) {
        addBatch(
          suggestions.filter((s): s is string => typeof s === "string"),
        );
      }
      return getUnusedSuggestions();
    } catch {
      // Network error / endpoint misconfigured — leave cache as-is.
      return getUnusedSuggestions();
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/**
 * Backward-compatible alias for clearing the cache (used by "Generate new
 * suggestions" flows that want a full reset before refetching).
 */
export const invalidateHeroSuggestionsCache = clearSuggestionCache;
