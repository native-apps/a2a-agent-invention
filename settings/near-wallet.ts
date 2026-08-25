// ---------------------------------------------------------------------------
// near-wallet.ts — NEAR scoped-access-key wallet connect for the wizard
// ---------------------------------------------------------------------------
// User-approved flow (Option B, 2026-08-25): the wizard generates an ed25519
// keypair in-app; the user adds the PUBLIC key as a FUNCTION-CALL access key
// on their NEAR account via any wallet's login URL (scoped to the Neighbors
// registry contract: register/update/heartbeat only — it cannot move funds
// or touch anything else); the wizard then signs and submits the register/
// update transaction itself via free public RPC. No seed phrases, no
// redirects, no terminal — and the same key later enables the worker
// heartbeat (deploy-pipeline secrets, future phase).
//
// MyNearWallet sunsets 31 Oct 2026 (testnet-only legacy preset); Meteor
// Wallet is the default preset. Every URL is editable — wallets change, the
// protocol doesn't.
//
// Zero npm dependencies: Web Crypto Ed25519 (Safari 17+ / macOS 14+,
// feature-detected) + hand-rolled base58/borsh for the ONE transaction shape
// we sign (FunctionCall on the neighbors registry contract).
// ---------------------------------------------------------------------------

/** Shared register/update args — the contract's exact JSON schema. Used by
 *  BOTH the wizard's CLI command generator and the wallet-connect tx path
 *  (the two must never drift apart). */
export function buildNeighborRegisterArgs(fields: {
  agentName?: string;
  websiteUrl?: string;
  agentUrl?: string;
  agentDescription?: string;
  neighborTags?: string;
  neighborCategory?: string;
  neighborCapabilities?: string;
  neighborPartnerNote?: string;
}): Record<string, unknown> {
  const domainFromUrl = (() => {
    try {
      return (
        new URL(fields.websiteUrl || fields.agentUrl || "").hostname || ""
      ).replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  const splitList = (v: string) =>
    v.split(",").map((s) => s.trim()).filter(Boolean);
  const tagsArr = splitList(fields.neighborTags || "");
  const capsArr = splitList(fields.neighborCapabilities || "");
  return {
    name: fields.agentName || "My Agent",
    domain: domainFromUrl || "example.com",
    agent_url: fields.agentUrl || "https://a2a.example.com",
    website_url: fields.websiteUrl || "https://example.com",
    description: fields.agentDescription || "What this agent does",
    tags: tagsArr.length ? tagsArr : ["ai"],
    category: fields.neighborCategory || "startup",
    capabilities: capsArr.length ? capsArr : ["general-assistant"],
    partner_note: fields.neighborPartnerNote || "",
  };
}

// ── Network constants (testnet until mainnet graduation — flip at swap) ──
export const NEAR_RPC_TESTNET = "https://test.rpc.fastnear.com";
export const NEAR_RPC_MAINNET = "https://rpc.fastnear.com";
export const NEIGHBORS_CONTRACT_TESTNET = "neighborly.testnet";
export const NEIGHBORS_CONTRACT_MAINNET = "neighborly.near";

/** The ONLY methods the scoped key may call (wallet enforces this). */
export const NEIGHBOR_KEY_METHODS = ["register", "update", "heartbeat"];

/** register deposit: 0.01 NEAR refundable · update: 0 */
export const REGISTER_DEPOSIT_YOCTO = 10000000000000000000000n; // 10^22
export const REGISTER_GAS = 100000000000000n; // 100 Tgas

// ── base58 (Bitcoin alphabet — NEAR's format) ─────────────────────────────
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function base58Encode(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let out = "";
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out;
    n /= 58n;
  }
  // leading zero bytes → leading "1"s
  for (const b of bytes) {
    if (b === 0) out = "1" + out;
    else break;
  }
  return out || "1";
}

export function base58Decode(s: string): Uint8Array {
  const bytes: number[] = [];
  for (const ch of s) {
    const digit = B58.indexOf(ch);
    if (digit < 0) throw new Error(`invalid base58 character "${ch}"`);
    let carry = digit;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // leading "1"s → leading zero bytes
  for (const ch of s) {
    if (ch === "1") bytes.push(0);
    else break;
  }
  return new Uint8Array(bytes.reverse());
}

// ── Borsh primitives (little-endian) ──────────────────────────────────────
function u8(n: number): Uint8Array {
  return new Uint8Array([n & 0xff]);
}
function u32le(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}
function u64le(n: bigint | number): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(n), true);
  return b;
}
function u128le(n: bigint): Uint8Array {
  const b = new Uint8Array(16);
  let v = n;
  for (let i = 0; i < 16; i++) {
    b[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return b;
}
function borshString(s: string): Uint8Array {
  const utf8 = new TextEncoder().encode(s);
  return concat(u32le(utf8.length), utf8);
}
function borshVecBytes(b: Uint8Array): Uint8Array {
  return concat(u32le(b.length), b);
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// ── Keypair (Web Crypto Ed25519, feature-detected) ────────────────────────
export interface NeighborKeyMaterial {
  /** "ED25519:<base58>" — the public identity shown to the wallet */
  publicKey: string;
  /** base64 PKCS#8 private key — SCOPED function-call key only; cannot move funds */
  secret: string;
}

export async function webcryptoEd25519Available(): Promise<boolean> {
  try {
    await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
      "sign",
      "verify",
    ]);
    return true;
  } catch {
    return false;
  }
}

export async function generateNeighborKey(): Promise<NeighborKeyMaterial> {
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ]);
  const rawPub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const pkcs8 = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", pair.privateKey),
  );
  let bin = "";
  for (const b of pkcs8) bin += String.fromCharCode(b);
  return {
    publicKey: `ED25519:${base58Encode(rawPub)}`,
    secret: btoa(bin),
  };
}

async function importSecretKey(pkcs8Base64: string): Promise<CryptoKey> {
  const bin = atob(pkcs8Base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return crypto.subtle.importKey("pkcs8", bytes, { name: "Ed25519" }, false, [
    "sign",
  ]);
}

// ── Wallet login URL ──────────────────────────────────────────────────────
/** Standard NEAR wallet login params (requestSignIn format) — the wallet
 *  adds a FUNCTION-CALL key for our public key, scoped to contract+methods. */
export interface WalletPreset {
  id: string;
  label: string;
  loginUrl: string;
  note?: string;
}

export const WALLET_PRESETS: WalletPreset[] = [
  {
    id: "meteor",
    label: "Meteor Wallet",
    loginUrl: "https://wallet.meteorwallet.app/login",
    note: "leading NEAR wallet (default)",
  },
  {
    id: "mnw-testnet",
    label: "MyNearWallet (testnet — sunsets Oct 2026)",
    loginUrl: "https://testnet.mynearwallet.com/login/",
    note: "legacy testnet option",
  },
  {
    id: "here",
    label: "HERE Wallet",
    loginUrl: "https://wallet.here.org/login",
    note: "best-effort preset — edit the URL if needed",
  },
];

export function buildWalletLoginUrl(opts: {
  baseUrl: string;
  contract: string;
  publicKey: string;
  title?: string;
  methods?: string[];
}): string {
  const url = new URL(opts.baseUrl);
  url.searchParams.set("title", opts.title || "NEAR Neighbors");
  url.searchParams.set("contract_id", opts.contract);
  url.searchParams.set(
    "method_names",
    (opts.methods || NEIGHBOR_KEY_METHODS).join(","),
  );
  url.searchParams.set("public_key", opts.publicKey);
  return url.toString();
}

// ── NEAR RPC (read-only queries are free on FastNEAR) ─────────────────────
async function nearRpc<T = Record<string, unknown>>(
  rpcUrl: string,
  method: string,
  params: unknown,
): Promise<T> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "near-wallet", method, params }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const json = (await res.json()) as { result?: T; error?: { message?: string } };
  if (json.error) throw new Error(json.error.message || "RPC error");
  return json.result as T;
}

export interface AccountKeyInfo {
  public_key: string;
  access_key: {
    nonce: number;
    permission?: unknown;
  };
}

export async function getAccountKeys(
  rpcUrl: string,
  account: string,
): Promise<AccountKeyInfo[]> {
  // NOTE: view_access_key_list returns keys DIRECTLY as JSON
  // (result.keys) — unlike call_function, there is NO byte-array
  // result.result wrapper. (Bug caught live 2026-08-25: the byte-array
  // assumption made every Verify fail with "unexpected shape".)
  const r = await nearRpc<{ keys?: AccountKeyInfo[] }>(rpcUrl, "query", {
    request_type: "view_access_key_list",
    finality: "final",
    account_id: account,
  });
  if (!Array.isArray(r?.keys)) {
    throw new Error("unexpected access_key_list shape");
  }
  return r.keys;
}

/** Result of checking whether our scoped key is on an account. */
export type NeighborKeyCheck = {
  found: boolean;
  nonce: number | null;
  /** Raw chain permission — "FullAccess" or { FunctionCall: { receiver_id, method_names } }. */
  permission?: unknown;
};

/** Is our scoped key added to the account yet? Returns its next nonce and
 *  permission. NOTE: RPC returns "ed25519:" prefixes lowercase — case-blind. */
export async function verifyNeighborKeyOnAccount(
  rpcUrl: string,
  account: string,
  publicKey: string,
): Promise<NeighborKeyCheck> {
  const keys = await getAccountKeys(rpcUrl, account);
  const match = keys.find(
    (k) => k.public_key.toLowerCase() === publicKey.toLowerCase(),
  );
  return {
    found: !!match,
    nonce: match ? match.access_key.nonce + 1 : null,
    permission: match?.access_key?.permission,
  };
}

/** null when the key is properly limited to the neighbors registry;
 *  otherwise a human-readable problem. Catches the 2026-08-25 live incident:
 *  MyNearWallet (legacy) granted FULL ACCESS despite the scoped login URL —
 *  and the approval landed on the wrong (logged-in) account. */
export function neighborKeyPermissionIssue(
  permission: unknown,
  contract: string,
): string | null {
  if (permission == null) return null; // unknown shape — don't block on it
  if (permission === "FullAccess") {
    return (
      "your wallet granted this key FULL ACCESS — far more than it needs. " +
      "Revoke it (wallet → Authorized Apps), then re-approve the wallet link " +
      "keeping the LIMITED access option."
    );
  }
  const fc = (
    permission as {
      FunctionCall?: { receiver_id?: string; method_names?: string[] };
    }
  ).FunctionCall;
  if (fc && fc.receiver_id && fc.receiver_id !== contract) {
    return (
      `this key is scoped to contract ${fc.receiver_id}, not ${contract} — ` +
      "revoke it and re-approve with the wallet link."
    );
  }
  return null;
}

/** Poll until the user approves the key in their wallet (or timeout). */
export async function waitForNeighborKey(
  rpcUrl: string,
  account: string,
  publicKey: string,
  timeoutMs = 120_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const { found } = await verifyNeighborKeyOnAccount(rpcUrl, account, publicKey);
      if (found) return true;
    } catch {
      /* account may not resolve yet — keep polling */
    }
    await new Promise((r) => setTimeout(r, 4_000));
  }
  return false;
}

export async function getLatestBlockHash(rpcUrl: string): Promise<string> {
  const r = await nearRpc<{ sync_info?: { latest_block_hash?: string } }>(
    rpcUrl,
    "status",
    [],
  );
  const hash = r?.sync_info?.latest_block_hash;
  if (!hash) throw new Error("no latest_block_hash in status");
  return hash;
}

/** Registry entry for an account — null when not registered. (args key MUST
 *  be "account" — contract signature get_agent(account: AccountId); gotcha #10.) */
export async function getRegistryEntry(
  rpcUrl: string,
  contract: string,
  account: string,
): Promise<Record<string, unknown> | null> {
  const args = btoa(JSON.stringify({ account }));
  // nearRpc already unwraps the JSON-RPC envelope (json.result), so the
  // call_function byte array sits at r.result — NOT r.result.result.
  // (Double-nesting bug caught live 2026-08-25 — it made every
  // register-vs-update detection fail to the catch → wrong "register".)
  const r = await nearRpc<{ result?: number[] }>(rpcUrl, "query", {
    request_type: "call_function",
    finality: "final",
    account_id: contract,
    method_name: "get_agent",
    args_base64: args,
  });
  const bytes = r?.result;
  if (!Array.isArray(bytes)) throw new Error("unexpected get_agent shape");
  const parsed = JSON.parse(
    new TextDecoder().decode(new Uint8Array(bytes)),
  );
  return parsed && typeof parsed === "object" ? parsed : null;
}

// ── Transaction build + sign + broadcast ──────────────────────────────────
/**
 * Borsh-serialize a NEAR Transaction (one FunctionCall action):
 *   Transaction { signer_id: String, public_key: PublicKey(ED25519=0+32B),
 *                 nonce: u64, receiver_id: String, block_hash: [u8;32],
 *                 actions: Vec<Action(FunctionCall=2)> }
 *   FunctionCall { method_name: String, args: Vec<u8>, gas: u64, deposit: u128 }
 */
export function serializeTransaction(t: {
  signerId: string;
  publicKeyBytes: Uint8Array;
  nonce: number;
  receiverId: string;
  blockHashBytes: Uint8Array;
  methodName: string;
  argsBytes: Uint8Array;
  gas: bigint;
  depositYocto: bigint;
}): Uint8Array {
  return concat(
    borshString(t.signerId),
    u8(0), // PublicKey::ED25519
    t.publicKeyBytes,
    u64le(t.nonce),
    borshString(t.receiverId),
    t.blockHashBytes,
    u32le(1), // one action
    u8(2), // Action::FunctionCall
    borshString(t.methodName),
    borshVecBytes(t.argsBytes),
    u64le(t.gas),
    u128le(t.depositYocto),
  );
}

export interface RegistryTxResult {
  ok: boolean;
  action: "register" | "update";
  txHash?: string;
  error?: string;
}

/** Full wallet-connect write: verify key → nonce → block hash → sign →
 *  broadcast_tx_commit. Registers (0.01Ⓝ deposit) or updates (0 deposit). */
export async function signAndSendRegistryTx(opts: {
  rpcUrl: string;
  contract: string;
  account: string;
  key: NeighborKeyMaterial;
  action: "register" | "update";
  args: Record<string, unknown>;
}): Promise<RegistryTxResult> {
  const { rpcUrl, contract, account, key, action, args } = opts;
  try {
    // 1. The scoped key must be on the account (user approved it in wallet)
    //    — and it must be LIMITED to the registry (never sign with an
    //    over-permissioned key; the wallet may have granted full access).
    const { found, nonce, permission } = await verifyNeighborKeyOnAccount(
      rpcUrl,
      account,
      key.publicKey,
    );
    if (!found || nonce == null) {
      return {
        ok: false,
        action,
        error:
          "Your neighbor key isn't on this account yet — open the wallet link (step 2) and approve it, then retry.",
      };
    }
    const permIssue = neighborKeyPermissionIssue(permission, contract);
    if (permIssue) {
      return {
        ok: false,
        action,
        error: `Refusing to use an over-permissioned key: ${permIssue}`,
      };
    }

    // 2. Latest block hash
    const blockHashB58 = await getLatestBlockHash(rpcUrl);
    const blockHashBytes = base58Decode(blockHashB58);
    if (blockHashBytes.length !== 32) {
      return { ok: false, action, error: "invalid block hash from RPC" };
    }

    // 3. Serialize the transaction
    const pubB58 = key.publicKey.replace(/^ED25519:/, "");
    const publicKeyBytes = base58Decode(pubB58);
    if (publicKeyBytes.length !== 32) {
      return { ok: false, action, error: "stored public key is malformed — regenerate the neighbor key" };
    }
    const argsBytes = new TextEncoder().encode(JSON.stringify(args));
    const txBytes = serializeTransaction({
      signerId: account,
      publicKeyBytes,
      nonce,
      receiverId: contract,
      blockHashBytes,
      methodName: action,
      argsBytes,
      gas: REGISTER_GAS,
      depositYocto: action === "register" ? REGISTER_DEPOSIT_YOCTO : 0n,
    });

    // 4. Sign (Ed25519) → SignedTransaction { transaction, signature(ED25519=0+64B) }
    const priv = await importSecretKey(key.secret);
    const sigBuf = await crypto.subtle.sign({ name: "Ed25519" }, priv, txBytes);
    const signed = concat(txBytes, u8(0), new Uint8Array(sigBuf));
    let bin = "";
    for (const b of signed) bin += String.fromCharCode(b);
    const signedB64 = btoa(bin);

    // 5. Broadcast + inspect execution status
    const r = await nearRpc<{
      status?: { SuccessValue?: string; Failure?: unknown };
      transaction?: { hash?: string };
    }>(rpcUrl, "broadcast_tx_commit", [signedB64]);
    const txHash = r?.transaction?.hash;
    if (r?.status && "SuccessValue" in r.status) {
      return { ok: true, action, txHash };
    }
    const failure = (r?.status as { Failure?: unknown } | undefined)?.Failure;
    return {
      ok: false,
      action,
      txHash,
      error: `Transaction executed but failed: ${JSON.stringify(failure).slice(0, 300)}`,
    };
  } catch (err) {
    return {
      ok: false,
      action,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Decide register vs update from the live registry, then run the tx. */
export async function registerOrUpdateOnchain(opts: {
  rpcUrl: string;
  contract: string;
  account: string;
  key: NeighborKeyMaterial;
  args: Record<string, unknown>;
}): Promise<RegistryTxResult> {
  let action: "register" | "update" = "register";
  try {
    const existing = await getRegistryEntry(opts.rpcUrl, opts.contract, opts.account);
    if (existing && (existing as { name?: unknown }).name) {
      action = "update"; // register would fail "already registered — use update()"
    }
  } catch {
    /* if the check fails, attempt register — the contract is the source of truth */
  }
  return signAndSendRegistryTx({ ...opts, action });
}
