/**
 * JWT Session Token Verification
 *
 * Verifies JWT session tokens issued by the Mother Brain auth system
 * (motherbrain.app). These tokens are sent by the website chat widget
 * via the Authorization: Bearer header when an authenticated user
 * sends a support message.
 *
 * JWT structure (HS256):
 *   header:  { "alg": "HS256", "typ": "JWT" }
 *   payload: { "sub": "123", "jti": "uuid", "exp": ..., "vid": "...", "lic": [...] }
 *
 *   - sub: customerId (as string — parse to integer for DB storage)
 *   - jti: unique session ID (for revocation tracking)
 *   - exp: expiry timestamp (Unix seconds — 1hr or 24hr)
 *   - vid: visitor_id (Broprint.js device fingerprint)
 *   - lic: license keys array
 *
 * Uses the Web Crypto API (crypto.subtle) for HMAC-SHA256 — native to
 * Cloudflare Workers, no external dependencies needed.
 *
 * Fail-closed policy: if a JWT is sent but JWT_SECRET is not configured,
 * the handler must reject with 503. This module's verifyJwt() throws in
 * that case — the caller (index.ts) catches and returns 503.
 */

let jwtSecret: string | undefined;

/**
 * Set the JWT verification secret from Worker env var.
 * Called on each request via middleware (same pattern as setGatewayUrl).
 */
export function setJwtSecret(secret?: string) {
  jwtSecret = secret;
}

export function isJwtSecretConfigured(): boolean {
  return !!jwtSecret;
}

export interface JwtClaims {
  sub: string; // customerId (as string)
  jti: string; // session ID
  exp: number; // expiry (Unix seconds)
  iat?: number; // issued at (Unix seconds)
  vid?: string; // visitor_id (device fingerprint)
  lic?: string[]; // active license keys
}

/**
 * Decode a base64url string to a Uint8Array.
 * JWT uses base64url (no padding): '-' → '+', '_' → '/'.
 */
function base64urlDecode(input: string): Uint8Array {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encode an ArrayBuffer to base64url string (no padding).
 */
function base64urlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Verify a JWT session token.
 *
 * Verifies the HS256 signature using the configured secret, checks
 * expiry, and returns the decoded claims. Returns null if the token
 * is invalid, expired, or malformed.
 *
 * Throws if JWT_SECRET is not configured — the caller should catch
 * this and return 503 (fail-closed policy).
 */
export async function verifyJwt(token: string): Promise<JwtClaims | null> {
  if (!jwtSecret) {
    throw new Error("JWT_SECRET not configured");
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    console.warn("[jwt] Invalid token: expected 3 parts, got", parts.length);
    return null;
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const signedData = `${headerB64}.${payloadB64}`;

  try {
    // Import the secret as an HMAC-SHA256 key
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(jwtSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    // Compute the expected signature
    const expectedSigBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(signedData),
    );

    const expectedSigB64 = base64urlEncode(expectedSigBuffer);

    // Constant-time comparison to prevent timing attacks
    if (!constantTimeEquals(expectedSigB64, signatureB64)) {
      console.warn("[jwt] Invalid signature");
      return null;
    }

    // Decode the payload
    const payloadBytes = base64urlDecode(payloadB64);
    const payloadJson = new TextDecoder().decode(payloadBytes);
    const claims = JSON.parse(payloadJson) as JwtClaims;

    // Validate required claims
    if (!claims.sub || !claims.exp) {
      console.warn("[jwt] Missing required claims (sub or exp)");
      return null;
    }

    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    if (claims.exp < now) {
      console.warn("[jwt] Token expired");
      return null;
    }

    return claims;
  } catch (err) {
    console.error(
      "[jwt] Verification failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
