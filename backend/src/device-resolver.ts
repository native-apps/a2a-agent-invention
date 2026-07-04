/**
 * Device Resolver — Cross-Device Chat
 *
 * Resolves ALL visitor_ids for a customer by calling the Encore
 * auth/resolve-visitor-ids endpoint. This enables cross-device chat:
 * when a user pairs multiple devices (phone, tablet, desktop) via QR
 * code login, each device gets its own visitor_id (Broprint.js fingerprint).
 * All visitor_ids are linked to one customer_id.
 *
 * Chat history is queried across ALL visitor_ids so the user sees the
 * same conversation regardless of which device they're on.
 *
 * Results are cached for 5 minutes (TTL) to avoid calling the API on
 * every message — the list of paired devices changes infrequently.
 */

let encoreApiUrl: string | undefined;
let encoreApiKey: string | undefined;

/**
 * Set the Encore API configuration from Worker env vars.
 * Shares the same ENCORE_API_URL / ENCORE_API_KEY as the license resolver.
 */
export function setDeviceResolverConfig(url?: string, key?: string) {
  encoreApiUrl = url;
  encoreApiKey = key;
}

// ── Cache ──────────────────────────────────────────────────────────────
// Simple in-memory cache: { customerId → { visitorIds, expiresAt } }
// Cloudflare Workers persists module-level state within an isolate.
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map<number, { visitorIds: string[]; expiresAt: number }>();

export interface DeviceResolution {
  visitorIds: string[];
  customerId: number;
  fromCache: boolean;
}

/**
 * Resolve all visitor_ids for a customer.
 *
 * Returns the primary visitor_id + all paired device visitor_ids.
 * Uses a 5-minute cache to avoid redundant API calls.
 *
 * If the API is unreachable or not configured, falls back to returning
 * just the provided fallback visitor_id (single-device mode).
 */
export async function resolveVisitorIds(
  customerId: number,
  fallbackVisitorId?: string,
): Promise<DeviceResolution> {
  // Check cache first
  const cached = cache.get(customerId);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      visitorIds: cached.visitorIds,
      customerId,
      fromCache: true,
    };
  }

  // If Encore API not configured, fall back to single visitor_id
  if (!encoreApiUrl) {
    return {
      visitorIds: fallbackVisitorId ? [fallbackVisitorId] : [],
      customerId,
      fromCache: false,
    };
  }

  try {
    const url = `${encoreApiUrl}/auth/resolve-visitor-ids`;
    const body: Record<string, unknown> = { customerId };

    // Include the Encore API key if configured (same lookup key as
    // license-resolver — SubscriptionLookupKey)
    if (encoreApiKey) {
      body.apiKey = encoreApiKey;
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.warn(
        `[device] resolve-visitor-ids returned ${res.status} for customer ${customerId}`,
      );
      return {
        visitorIds: fallbackVisitorId ? [fallbackVisitorId] : [],
        customerId,
        fromCache: false,
      };
    }

    const data = (await res.json()) as {
      visitorIds?: string[];
      customerId?: number;
    };

    if (data.visitorIds && data.visitorIds.length > 0) {
      // Cache the result
      cache.set(customerId, {
        visitorIds: data.visitorIds,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });

      console.log(
        `[device] Resolved ${data.visitorIds.length} visitor_ids for customer ${customerId}`,
      );

      return {
        visitorIds: data.visitorIds,
        customerId,
        fromCache: false,
      };
    }

    // No visitor_ids returned — fall back
    return {
      visitorIds: fallbackVisitorId ? [fallbackVisitorId] : [],
      customerId,
      fromCache: false,
    };
  } catch (err) {
    console.error(
      "[device] Error calling resolve-visitor-ids:",
      err instanceof Error ? err.message : err,
    );
    return {
      visitorIds: fallbackVisitorId ? [fallbackVisitorId] : [],
      customerId,
      fromCache: false,
    };
  }
}

/**
 * Clear the cache for a specific customer (or all if no ID provided).
 * Useful when a user pairs/unpairs a device and the cache is stale.
 */
export function clearDeviceCache(customerId?: number) {
  if (customerId !== undefined) {
    cache.delete(customerId);
  } else {
    cache.clear();
  }
}
