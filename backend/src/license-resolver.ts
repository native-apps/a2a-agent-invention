/**
 * License Key Resolver
 *
 * Resolves a Mother Brain license key to a visitor_id by calling the
 * Encore subscriptions API. This links in-app support messages to the
 * visitor's web chat history — the "conversion link."
 *
 * Flow:
 *   Mother Brain app sends support message with license_key in metadata
 *   → A2A Worker calls GET {ENCORE_API_URL}/subscriptions/lookup?key=XXX
 *   → Encore API returns { email, name, visitorId, isBetaTester, licenses[], ... }
 *   → A2A Worker stores the message under that visitorId
 *   → Message appears in the same conversation as the user's web chats
 *
 * Edge case: If the lookup returns no visitor_id (user purchased but never
 * visited the website), a deterministic fallback ID is generated:
 *   license:{key}
 *
 * Security: The license key is NEVER used as a chat identifier. It is a
 * product credential. The chat identity is always the resolved visitor_id.
 * The license_key is stored in a separate column for reference/tracking only.
 */

let encoreApiUrl: string | undefined;
let encoreApiKey: string | undefined;

/**
 * Set the Encore API configuration from Worker env vars.
 * Called on each request via middleware (same pattern as setGatewayUrl).
 */
export function setEncoreApiConfig(url?: string, key?: string) {
  encoreApiUrl = url;
  encoreApiKey = key;
}

export function isEncoreApiConfigured(): boolean {
  return !!encoreApiUrl;
}

export interface LicenseResolution {
  visitorId: string;
  email?: string;
  licenseKey: string;
  resolved: boolean; // true = resolved via Encore API, false = fallback
}

/**
 * Resolve a license key to a visitor_id via the Encore subscriptions API.
 *
 * Returns a LicenseResolution with the visitor_id to use for storage.
 * Never throws — on any error, falls back to `license:{key}` so the
 * message is still stored and can be re-linked later.
 */
export async function resolveLicenseKey(
  licenseKey: string,
): Promise<LicenseResolution> {
  const cleanKey = licenseKey.trim();
  if (!cleanKey) {
    throw new Error("License key is empty");
  }

  // If Encore API is not configured, use fallback
  if (!isEncoreApiConfigured()) {
    console.warn(
      "[license] Encore API not configured — using fallback visitor_id",
    );
    return {
      visitorId: `license:${cleanKey}`,
      licenseKey: cleanKey,
      resolved: false,
    };
  }

  try {
    const url = `${encoreApiUrl}/subscriptions/lookup?key=${encodeURIComponent(cleanKey)}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (encoreApiKey) {
      headers["Authorization"] = `Bearer ${encoreApiKey}`;
    }

    const res = await fetch(url, { headers });

    if (!res.ok) {
      console.warn(
        `[license] Encore API returned ${res.status} for key ${cleanKey.substring(0, 8)}...`,
      );
      return {
        visitorId: `license:${cleanKey}`,
        licenseKey: cleanKey,
        resolved: false,
      };
    }

    // Response shape from GET /subscriptions/lookup (Encore API):
    //   { email, name, visitorId, isBetaTester, licenses[], subscription }
    // NOTE: camelCase fields — NOT snake_case. No customer_id field.
    const data = (await res.json()) as {
      email?: string;
      name?: string;
      visitorId?: string;
      isBetaTester?: boolean;
    };

    // If the Encore API returned a visitorId, use it — this unifies
    // the user's in-app support messages with their web chat history.
    if (data.visitorId) {
      console.log(
        `[license] Resolved key ${cleanKey.substring(0, 8)}... → visitorId ${data.visitorId}`,
      );
      return {
        visitorId: data.visitorId,
        email: data.email,
        licenseKey: cleanKey,
        resolved: true,
      };
    }

    // No visitorId on the customer record — user purchased but never
    // chatted on the website. Use a deterministic fallback so future
    // messages from the same license key stay grouped.
    console.log(
      `[license] No visitorId for key ${cleanKey.substring(0, 8)}... — using fallback`,
    );
    return {
      visitorId: `license:${cleanKey}`,
      email: data.email,
      licenseKey: cleanKey,
      resolved: false,
    };
  } catch (err) {
    console.error(
      "[license] Error calling Encore API:",
      err instanceof Error ? err.message : err,
    );
    return {
      visitorId: `license:${cleanKey}`,
      licenseKey: cleanKey,
      resolved: false,
    };
  }
}
