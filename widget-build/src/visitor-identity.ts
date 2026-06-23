// ── Visitor Identity — Broprint.js fingerprinting ───────────────────────
// Mirrors frontend/services/visitor-identity.ts on the website.
// Uses localStorage key `motherbrain_visitor_id` so the widget and the
// website share the SAME visitor ID → same Supabase chat history, consistent
// "continue paused conversation", per-visitor rate limiting, and AI
// suggestion personalization.
//
// Privacy: No PII — just a canvas+audio hash. Fallback chain:
//   Broprint.js → crypto.randomUUID() → Date.now()+Math.random()

import { getCurrentBrowserFingerPrint } from "@rajesh896/broprint.js";

const STORAGE_KEY = "motherbrain_visitor_id"; // PRIMARY — matches website
const LEGACY_KEY = "motherbrain_widget_visitor_id"; // backward compat (old widget)

// ── Stale Key Cleanup ───────────────────────────────────────────────────
// Old chat implementations wrote these keys to localStorage, causing
// duplicate/conflicting identity state. Cleaned up once per cold cache
// after the canonical visitor_id resolves.
const STALE_TASK_KEYS = [
  "motherbrain_task_id", // old React ChatContext (website)
  "motherbrain_chat_task_id", // old motherbrain-chat.js web component
];

function cleanupStaleKeys(): void {
  try {
    localStorage.removeItem("motherbrain_widget_visitor_id"); // legacy visitor ID
    for (const key of STALE_TASK_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    /* localStorage blocked */
  }
}

let cachedVisitorId: string | null = null;
let pendingPromise: Promise<string> | null = null;

/**
 * Get or generate a persistent visitor ID.
 *
 * Resolution order:
 *   1. In-memory cache
 *   2. Primary localStorage key (shared with the website)
 *   3. Legacy widget key (migrated to primary)
 *   4. New Broprint.js fingerprint
 *   5. crypto.randomUUID() fallback (canvas/audio blocked)
 *   6. Date.now()+Math.random() final fallback
 *
 * All generated formats use the `vid_` prefix, matching the website.
 *
 * Race-condition safe: concurrent first-time callers share a single
 * in-flight Broprint.js fingerprint via `pendingPromise`, so they can never
 * diverge into different visitor IDs (which would split the session before
 * it starts — the exact bug this guard prevents).
 */
export async function getVisitorId(): Promise<string> {
  if (cachedVisitorId) return cachedVisitorId;

  // CRITICAL: If another call is already resolving the ID, wait for it.
  // Without this, concurrent calls on a first-time visit each start their
  // own Broprint.js fingerprint and can generate DIFFERENT visitor IDs.
  if (pendingPromise) return pendingPromise;

  pendingPromise = resolveVisitorId();
  try {
    const id = await pendingPromise;
    cleanupStaleKeys(); // Remove stale keys from old implementations (once per cold cache)
    return id;
  } finally {
    pendingPromise = null;
  }
}

/**
 * Resolve (or generate) the visitor ID. Called once per cold cache; concurrent
 * callers are de-duplicated by the `pendingPromise` guard in `getVisitorId`.
 */
async function resolveVisitorId(): Promise<string> {
  // 1. Primary key (shared with the website)
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      cachedVisitorId = stored;
      return stored;
    }
  } catch {
    /* localStorage blocked */
  }

  // 2. Backward compat: migrate old widget key to the primary key
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
    // 4. Fallback: canvas/audio blocked (e.g. Comet by Perplexity, Tor)
    try {
      const fallbackId = `vid_${crypto.randomUUID().replace(/-/g, "")}`;
      localStorage.setItem(STORAGE_KEY, fallbackId);
      cachedVisitorId = fallbackId;
      return fallbackId;
    } catch {
      // 5. Final fallback if crypto.randomUUID is also unavailable
      const rawId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      const fallbackId = `vid_${rawId}`;
      localStorage.setItem(STORAGE_KEY, fallbackId);
      cachedVisitorId = fallbackId;
      return fallbackId;
    }
  }
}

/** True if this device has an established visitor ID (primary or legacy). */
export function isReturningVisitor(): boolean {
  try {
    return (
      localStorage.getItem(STORAGE_KEY) !== null ||
      localStorage.getItem(LEGACY_KEY) !== null
    );
  } catch {
    return false;
  }
}

/** Clear visitor identity (GDPR / privacy compliance). */
export function clearVisitorId(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* localStorage blocked */
  }
  cachedVisitorId = null;
}
