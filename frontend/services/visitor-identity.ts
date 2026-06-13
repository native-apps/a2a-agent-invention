/**
 * Visitor Identity Service — Broprint.js fingerprinting
 * Generates a unique, persistent device fingerprint for anonymous website visitors.
 *
 * Uses:
 * - Conversation continuity across sessions
 * - Per-visitor rate limiting
 * - Analytics: unique visitor tracking
 * - "Welcome back!" greetings from Mother
 *
 * Storage: localStorage as `motherbrain_visitor_id`
 * Privacy: No PII collected — just a canvas+audio hash
 */

import { getCurrentBrowserFingerPrint } from "@rajesh896/broprint.js";

const STORAGE_KEY = "motherbrain_visitor_id";

let cachedVisitorId: string | null = null;

/**
 * Get or generate a persistent visitor ID.
 * Tries localStorage first, then generates via Broprint.js.
 */
export async function getVisitorId(): Promise<string> {
  // Return cached value if available
  if (cachedVisitorId) return cachedVisitorId;

  // Check localStorage
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    cachedVisitorId = stored;
    return stored;
  }

  // Generate new fingerprint
  try {
    const fingerprint = await getCurrentBrowserFingerPrint();
    const visitorId = `vid_${fingerprint}`;

    // Persist
    localStorage.setItem(STORAGE_KEY, visitorId);
    cachedVisitorId = visitorId;

    return visitorId;
  } catch {
    // Fallback: generate a random ID if fingerprinting fails
    // Some browsers (e.g., Comet by Perplexity) block canvas/audio APIs
    try {
      const fallbackId = `vid_${crypto.randomUUID().replace(/-/g, "")}`;
      localStorage.setItem(STORAGE_KEY, fallbackId);
      cachedVisitorId = fallbackId;
      return fallbackId;
    } catch {
      // Final fallback if crypto.randomUUID also unavailable
      const rawId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      const fallbackId = `vid_${rawId}`;
      localStorage.setItem(STORAGE_KEY, fallbackId);
      cachedVisitorId = fallbackId;
      return fallbackId;
    }
  }
}

/**
 * Check if this is a returning visitor (has existing conversations)
 */
export function isReturningVisitor(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

/**
 * Clear visitor identity (for privacy/GDPR compliance)
 */
export function clearVisitorId(): void {
  localStorage.removeItem(STORAGE_KEY);
  cachedVisitorId = null;
}
