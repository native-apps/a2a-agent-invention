/**
 * Owner Push Notifications (v1.2.354) — the agent IS the transmitter.
 *
 * Handoff: near-neighbors-network/AGENT-PUSH-HANDOFF.md (+ my 2026-09-26
 * Q&A appended there). The NNN PWA pairs the owner's device with THIS
 * agent (wallet-signed NEP-413); inbound knocks push straight from the
 * worker to every paired device. Zero NNN infrastructure in the path.
 *
 * ZERO new npm dependencies: Web Push is implemented with WebCrypto
 * (RFC 8291 aes128gcm + RFC 8292 VAPID ES256), so no nodejs_compat flag
 * and no web-push package — nothing new for the deploy pipeline to install.
 *
 * Storage (per-agent Supabase, NOT KV — workers have none):
 *   push_config        — one row: this agent's VAPID keypair (lazy-generated)
 *   push_subscriptions — paired devices, keyed by push endpoint (multi-device)
 */

import type { Env } from "./types";
import type { SupabaseClient } from "./supabase";
import { getClientIP, checkRateLimit } from "./security";

// ── CORS (PWA origin + dev origins; CORS is NOT the auth gate — the
//    NEP-413 wallet signature is) ─────────────────────────────────────────
const PUSH_ALLOWED_ORIGINS = new Set([
  "https://nearneighbors.network",
  "http://localhost:3000",
  "http://localhost:5173",
]);

export function pushCorsHeaders(origin: string | null | undefined): Record<string, string> {
  if (origin && PUSH_ALLOWED_ORIGINS.has(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };
  }
  return { Vary: "Origin" };
}

// ── byte helpers ──────────────────────────────────────────────────────────
function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}
function b64uEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64Decode(s: string): Uint8Array {
  const norm = s.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  const bin = atob(norm);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function concat(parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

// base58 (NEAR public keys are base58) — same approach as the NNN gateway.
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58decode(s: string): Uint8Array {
  let n = 0n;
  for (const c of s) {
    const i = B58.indexOf(c);
    if (i < 0) throw new Error("invalid base58");
    n = n * 58n + BigInt(i);
  }
  let hex = n.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  const body = hex ? hexToBytes(hex) : new Uint8Array(0);
  let lead = 0;
  for (const c of s) {
    if (c === "1") lead++;
    else break;
  }
  return concat([new Uint8Array(lead), body]);
}
function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
/** Decode a wallet-provided key/signature (base64 or base58). */
function decodeBytes(s: string, expectedLen: number): Uint8Array {
  try {
    const asB64 = b64Decode(s);
    if (asB64.length === expectedLen) return asB64;
  } catch {
    /* fall through to base58 */
  }
  return b58decode(s);
}

// ── VAPID keypair management (lazy-generated, persisted in push_config) ──
export interface VapidKeys {
  publicKeyB64Url: string; // uncompressed P-256 point (65B), base64url — `k=` + applicationServerKey
  privateJwk: JsonWebKey; // P-256 ECDSA private (includes x,y)
}

async function generateVapidKeys(): Promise<VapidKeys> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign"],
  );
  const privateJwk = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey;
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return { publicKeyB64Url: b64uEncode(raw), privateJwk };
}

interface PushConfigRow {
  vapid_public_key: string;
  vapid_private_jwk: string;
}

export async function getVapidKeys(db: SupabaseClient, env: Env): Promise<VapidKeys | null> {
  // 1. Power-user override: a full JWK (with x,y) deployed as a secret.
  if (env.VAPID_PRIVATE_KEY) {
    try {
      const jwk = JSON.parse(env.VAPID_PRIVATE_KEY) as JsonWebKey;
      if (jwk.x && jwk.y && jwk.d) {
        const pub = concat([new Uint8Array([0x04]), b64Decode(String(jwk.x)), b64Decode(String(jwk.y))]);
        return { publicKeyB64Url: b64uEncode(pub), privateJwk: jwk };
      }
    } catch {
      /* malformed override — fall through */
    }
  }
  try {
    const read = async (): Promise<PushConfigRow[]> =>
      (await db
        .from("push_config")
        .then((q) => q.select("vapid_public_key,vapid_private_jwk").eq("id", true).limit(1)
          .get<PushConfigRow>())) || [];
    const rows = await read();
    if (rows.length) {
      return { publicKeyB64Url: rows[0].vapid_public_key, privateJwk: JSON.parse(rows[0].vapid_private_jwk) };
    }
    // 2. Lazy-generate on first pair. Race-safe: insert may lose to a
    // concurrent request — loser re-reads and uses the winner's key.
    const fresh = await generateVapidKeys();
    try {
      await db.from("push_config").then((q) =>
        q.insert({
          id: true,
          vapid_public_key: fresh.publicKeyB64Url,
          vapid_private_jwk: JSON.stringify(fresh.privateJwk),
        }),
      );
      return fresh;
    } catch {
      const again = await read();
      return again.length
        ? { publicKeyB64Url: again[0].vapid_public_key, privateJwk: JSON.parse(again[0].vapid_private_jwk) }
        : fresh;
    }
  } catch {
    return null;
  }
}

// ── NEP-413 wallet-signature verification (per NNN gateway auth.ts) ──────
// Payload: tag u32 LE 2147484061 || borsh str message || nonce[32] ||
//          borsh str recipient || borsh Option none (0x00). Sign over sha256.
function borshStr(s: string): Uint8Array {
  const b = utf8(s);
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, b.length, true);
  return concat([len, b]);
}
function walletSignPayload(message: string, nonce32: Uint8Array, recipient: string): Uint8Array {
  const tag = new Uint8Array(4);
  new DataView(tag.buffer).setUint32(0, 2147484061, true);
  return concat([tag, borshStr(message), nonce32, borshStr(recipient), new Uint8Array([0])]);
}
async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer));
}
async function verifyEd25519(message: Uint8Array, pubRaw: Uint8Array, sig: Uint8Array): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey("raw", pubRaw as unknown as ArrayBuffer, { name: "Ed25519" }, false, ["verify"]);
    return crypto.subtle.verify("Ed25519", key, sig as unknown as ArrayBuffer, message as unknown as ArrayBuffer);
  } catch {
    return false;
  }
}
/** Is this public key a live access key for the account? (NEAR RPC) */
async function hasAccessKey(rpcUrl: string, accountId: string, publicKeyB58: string): Promise<boolean> {
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8_000),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "push-pair",
        method: "query",
        params: {
          request_type: "view_access_key", // NOT "access_key" — RPC rejects that
          finality: "final",
          account_id: accountId,
          public_key: publicKeyB58.startsWith("ed25519:") ? publicKeyB58 : `ed25519:${publicKeyB58}`,
        },
      }),
    });
    const json = (await res.json()) as { result?: { permission?: unknown }; error?: unknown };
    return !json.error && !!json.result?.permission;
  } catch {
    return false;
  }
}

// ── Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID), pure WebCrypto ───────
async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm as unknown as ArrayBuffer, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt: salt as unknown as ArrayBuffer, info: info as unknown as ArrayBuffer },
      key,
      length * 8,
    ),
  );
}

async function encryptPayload(
  payload: string,
  p256dhB64: string,
  authB64: string,
): Promise<{ body: Uint8Array }> {
  const uaPubRaw = b64Decode(p256dhB64); // 65B uncompressed client key
  if (uaPubRaw.length !== 65) throw new Error("bad p256dh key");
  const uaKey = await crypto.subtle.importKey("raw", uaPubRaw as unknown as ArrayBuffer, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const as = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, as.privateKey, 256));
  const asPubRaw = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const authSecret = b64Decode(authB64);
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // RFC 8291 key schedule
  const ikm = await hkdf(shared, authSecret, concat([utf8("WebPush: info\x00"), uaPubRaw]), 32);
  const cek = await hkdf(ikm, salt, utf8("Content-Encoding: aes128gcm\x00"), 16);
  const nonce = await hkdf(ikm, salt, utf8("Content-Encoding: nonce\x00"), 12);

  const plaintext = concat([utf8(payload), new Uint8Array([0x02])]); // last-record delimiter
  const encKey = await crypto.subtle.importKey("raw", cek as unknown as ArrayBuffer, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce as unknown as ArrayBuffer, tagLength: 128 }, encKey, plaintext as unknown as ArrayBuffer),
  );

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, plaintext.length, false); // big-endian record size
  return { body: concat([salt, rs, new Uint8Array([asPubRaw.length]), asPubRaw, ct]) };
}

/** WebCrypto ECDSA emits ASN.1 DER; VAPID needs raw r||s (64 bytes). */
function derToRaw(der: Uint8Array): Uint8Array {
  let i = 2;
  if (der[1] & 0x80) i = 2 + (der[1] & 0x7f); // long-form length
  const readInt = (): Uint8Array => {
    if (der[i] !== 0x02) throw new Error("bad DER");
    const len = der[i + 1];
    i += 2;
    const v = der.slice(i, i + len);
    i += len;
    let s = 0;
    while (s < v.length - 1 && v[s] === 0) s++; // strip sign padding
    const val = v.slice(s).slice(-32); // keep the low 32 bytes max
    const out = new Uint8Array(32);
    out.set(val, 32 - val.length);
    return out;
  };
  const r = readInt();
  const s = readInt();
  return concat([r, s]);
}

async function vapidAuthHeader(vapid: VapidKeys, endpointOrigin: string): Promise<string> {
  const header = b64uEncode(utf8(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64uEncode(
    utf8(JSON.stringify({
      aud: endpointOrigin,
      exp: Math.floor(Date.now() / 1000) + 12 * 3600,
      sub: "mailto:support@motherbrain.app",
    })),
  );
  const signingInput = `${header}.${claims}`;
  const priv = await crypto.subtle.importKey("jwk", vapid.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const derSig = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, priv, utf8(signingInput) as unknown as ArrayBuffer),
  );
  return `vapid t=${signingInput}.${b64uEncode(derToRaw(derSig))}, k=${vapid.publicKeyB64Url}`;
}

export interface PushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function sendWebPush(
  sub: PushSubscriptionRow,
  payload: string,
  vapid: VapidKeys,
): Promise<{ ok: boolean; gone?: boolean }> {
  try {
    const { body } = await encryptPayload(payload, sub.p256dh, sub.auth);
    const origin = new URL(sub.endpoint).origin;
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        TTL: "86400",
        Urgency: "high",
        Authorization: await vapidAuthHeader(vapid, origin),
      },
      body: body as unknown as BodyInit,
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok || res.status === 201) return { ok: true };
    if (res.status === 404 || res.status === 410) return { ok: false, gone: true };
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

// ── The knock hook: notify every paired device + Telegram sibling rail ────
export async function notifyOwnerOfKnock(
  db: SupabaseClient | null,
  env: Env,
  info: { name: string; domain: string; message: string; kind?: string },
): Promise<void> {
  try {
    if (db) {
      const subs = (await db
        .from("push_subscriptions")
        .then((q) => q.select("endpoint,p256dh,auth").limit(10)
          .get<PushSubscriptionRow>())) || [];
      if (subs.length > 0) {
        const vapid = await getVapidKeys(db, env);
        if (vapid) {
          const who = info.name || info.domain || "A neighbor";
          const payload = JSON.stringify({
            title: `🚪 ${who} knocked your agent`,
            body: (info.message || "").slice(0, 200),
            url: "https://nearneighbors.network/app",
            tag: `knock:${info.domain}`,
          });
          const results = await Promise.all(subs.map((s) => sendWebPush(s, payload, vapid)));
          // prune dead subscriptions (404/410)
          const gone = subs.filter((_, i) => results[i]?.gone);
          for (const g of gone) {
            try {
              await db.from("push_subscriptions").then((q) => q.eq("endpoint", g.endpoint).delete());
            } catch {
              /* prune is best-effort */
            }
          }
          const alive = subs.length - gone.length;
          if (alive > 0) {
            const now = new Date().toISOString();
            for (const s of subs.filter((_, i) => results[i]?.ok)) {
              try {
                await db.from("push_subscriptions").then((q) => q.eq("endpoint", s.endpoint).update({ last_push_at: now }));
              } catch {
                /* best-effort */
              }
            }
          }
        }
      }
    }
    // Telegram sibling rail (redundant with push; both are wanted)
    if (env.TELEGRAM_BOT_TOKEN && env.KNOCK_TELEGRAM_PING !== "false" && env.OWNER_TELEGRAM_ID) {
      const chatId = parseInt(env.OWNER_TELEGRAM_ID, 10);
      if (!Number.isNaN(chatId)) {
        const who = info.name || info.domain || "A neighbor";
        const text = `🚪 ${who} knocked your agent${info.message ? `:\n\n${info.message.slice(0, 300)}` : ""}`;
        await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text }),
          signal: AbortSignal.timeout(10_000),
        });
      }
    }
  } catch {
    /* never break knock processing */
  }
}

// ── Route handlers ────────────────────────────────────────────────────────
export async function handlePushKey(
  env: Env,
  db: SupabaseClient | null,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!db) return { status: 503, body: { ok: false, error: "storage unavailable" } };
  const keys = await getVapidKeys(db, env);
  if (!keys) return { status: 500, body: { ok: false, error: "could not provision VAPID key" } };
  return { status: 200, body: { ok: true, vapidPublicKey: keys.publicKeyB64Url } };
}

interface PairBody {
  account?: string;
  publicKey?: string;
  signature?: string;
  nonce?: string;
  recipient?: string;
  message?: string;
  subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
}

export async function handlePushPair(
  request: Request,
  env: Env,
  db: SupabaseClient | null,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const ip = getClientIP(request);
  const rate = checkRateLimit(`push:${ip}`);
  if (!rate.allowed) {
    return { status: 429, body: { ok: false, error: "Rate limit exceeded. Please wait a moment." } };
  }
  const raw = await request.text();
  if (raw.length > 16384) return { status: 413, body: { ok: false, error: "Body too large." } };
  let body: PairBody;
  try {
    body = JSON.parse(raw || "{}") as PairBody;
  } catch {
    return { status: 400, body: { ok: false, error: "Body must be JSON." } };
  }

  const account = String(body.account || "").trim();
  const publicKey = String(body.publicKey || "").trim();
  const signature = String(body.signature || "").trim();
  const nonce = String(body.nonce || "").trim();
  const sub = body.subscription;
  if (!account || !publicKey || !signature || !nonce || !sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return { status: 400, body: { ok: false, error: "account, publicKey, signature, nonce, and subscription{endpoint,keys{p256dh,auth}} are required." } };
  }
  if (!db) return { status: 503, body: { ok: false, error: "storage unavailable" } };

  // Ownership: the wallet account must be THIS agent's owner/curator account.
  const curator = (env.NEIGHBORS_CURATOR || "").trim();
  if (!curator) {
    return { status: 400, body: { ok: false, error: "This agent has no owner NEAR account configured (set it in the Near Neighbors node)." } };
  }
  if (account !== curator) {
    return { status: 403, body: { ok: false, error: "This wallet is not this agent's owner account." } };
  }

  // Recipient: the wallet signed FOR this agent's URL.
  const expectedRecipient = (env.AGENT_URL || "").replace(/\/+$/, "");
  const recipient = String(body.recipient || expectedRecipient).replace(/\/+$/, "");
  if (expectedRecipient && recipient !== expectedRecipient) {
    return { status: 400, body: { ok: false, error: "recipient mismatch — pair from this agent's own entry in the NNN app." } };
  }

  // NEP-413 verification
  let nonceBytes: Uint8Array;
  try {
    nonceBytes = b64Decode(nonce);
  } catch {
    return { status: 400, body: { ok: false, error: "nonce must be base64 (32 bytes)." } };
  }
  if (nonceBytes.length !== 32) {
    return { status: 400, body: { ok: false, error: "nonce must be 32 bytes." } };
  }
  const message = String(body.message || `pair this device with my agent ${account}`);
  const pkStr = publicKey.includes(":") ? publicKey.slice(publicKey.indexOf(":") + 1) : publicKey;
  let pubRaw: Uint8Array;
  let sig: Uint8Array;
  try {
    pubRaw = decodeBytes(pkStr, 32);
    sig = decodeBytes(signature, 64);
  } catch {
    return { status: 400, body: { ok: false, error: "publicKey/signature encoding invalid." } };
  }
  if (pubRaw.length !== 32 || sig.length !== 64) {
    return { status: 400, body: { ok: false, error: "publicKey must be 32 bytes, signature 64." } };
  }
  const payloadHash = await sha256(walletSignPayload(message, nonceBytes, recipient));
  const sigValid = await verifyEd25519(payloadHash, pubRaw, sig);
  if (!sigValid) {
    return { status: 401, body: { ok: false, error: "wallet signature invalid." } };
  }
  const keyLive = await hasAccessKey(env.NEIGHBORS_RPC_URL || "https://rpc.fastnear.com", account, pkStr);
  if (!keyLive) {
    return { status: 401, body: { ok: false, error: "public key is not a live access key for that account." } };
  }

  // Store (multi-device: keyed by endpoint, upsert)
  const subEndpoint = sub.endpoint;
  const subP256dh = sub.keys.p256dh;
  const subAuth = sub.keys.auth;
  try {
    await db.from("push_subscriptions").then((q) =>
      q.upsert(
        {
          endpoint: subEndpoint,
          p256dh: subP256dh,
          auth: subAuth,
          account,
        },
        "endpoint",
      ),
    );
  } catch {
    return { status: 500, body: { ok: false, error: "could not store subscription" } };
  }
  let devices = 1;
  try {
    const rows = (await db.from("push_subscriptions").then((q) => q.select("endpoint").limit(20).get<{ endpoint: string }>())) || [];
    devices = rows.length;
  } catch {
    /* count is best-effort */
  }
  console.log(`[push] device paired for ${account} (${devices} total)`);
  return { status: 200, body: { ok: true, account, devices } };
}

export async function handlePushUnpair(
  request: Request,
  db: SupabaseClient | null,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const raw = await request.text();
  if (raw.length > 8192) return { status: 413, body: { ok: false, error: "Body too large." } };
  let body: { endpoint?: string };
  try {
    body = JSON.parse(raw || "{}") as { endpoint?: string };
  } catch {
    return { status: 400, body: { ok: false, error: "Body must be JSON." } };
  }
  const endpoint = String(body.endpoint || "").trim();
  if (!endpoint || !/^https?:\/\//.test(endpoint)) {
    return { status: 400, body: { ok: false, error: "endpoint (the push URL) is required." } };
  }
  if (!db) return { status: 503, body: { ok: false, error: "storage unavailable" } };
  try {
    await db.from("push_subscriptions").then((q) => q.eq("endpoint", endpoint).delete());
  } catch {
    return { status: 500, body: { ok: false, error: "could not remove subscription" } };
  }
  return { status: 200, body: { ok: true } };
}
