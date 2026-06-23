/**
 * License Key Resolver
 *
 * Resolves a Mother Brain license key to a visitor_id by calling the
 * Encore subscriptions API. This links in-app support messages to the
 * visitor's web chat history.
 *
 * Flow:
 *   Mother Brain app sends support message with license_key in metadata
 *   → A2A Worker calls GET {ENCORE_API_URL}/subscriptions/lookup?key=XXX&apiKey=YYY
 *   → Encore API returns { email, name, visitorId, isBetaTester, licenses[], ... }
 *   → A2A Worker stores the message under that visitorId
 *   → Message appears in the same conversation as the user's web chats
 *
 * CRITICAL: The visitor_id MUST always be the real one from the Encore API.
 * Never generate a synthetic visitor_id like "license:{key}". If resolution
 * fails, the message is stored with visitor_id = null (anonymous) and the
 * license_key is still recorded for later linking.
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
  visitorId: string | null;
  email?: string;
  licenseKey: string;
  resolved: boolean;
}

/**
 * Resolve a license key to a visitor_id via the Encore subscriptions API.
 *
 * Returns the real visitorId from the API. If resolution fails for any
 * reason, returns visitorId = null — NEVER a synthetic fallback.
 */
export async function resolveLicenseKey(
  licenseKey: string,
): Promise<LicenseResolution> {
  const cleanKey = licenseKey.trim();
  if (!cleanKey) {
    throw new Error("License key is empty");
  }

  if (!isEncoreApiConfigured()) {
    console.error("[license] Encore API not configured — cannot resolve");
    return { visitorId: null, licenseKey: cleanKey, resolved: false };
  }

  try {
    const params = new URLSearchParams({ key: cleanKey });
    if (encoreApiKey) {
      params.set("apiKey", encoreApiKey);
    }
    const url = `${encoreApiUrl}/subscriptions/lookup?${params.toString()}`;

    const res = await fetch(url);

    if (!res.ok) {
      console.error(
        `[license] Encore API returned ${res.status} for key ${cleanKey.substring(0, 8)}...`,
      );
      return { visitorId: null, licenseKey: cleanKey, resolved: false };
    }

    const data = (await res.json()) as {
      email?: string;
      name?: string;
      visitorId?: string;
      isBetaTester?: boolean;
    };

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

    console.error(
      `[license] No visitorId in Encore API response for key ${cleanKey.substring(0, 8)}...`,
    );
    return { visitorId: null, licenseKey: cleanKey, resolved: false };
  } catch (err) {
    console.error(
      "[license] Error calling Encore API:",
      err instanceof Error ? err.message : err,
    );
    return { visitorId: null, licenseKey: cleanKey, resolved: false };
  }
}
