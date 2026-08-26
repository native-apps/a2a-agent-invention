#!/usr/bin/env node
// ---------------------------------------------------------------------------
// seed-testnet-neighbors.mjs — populate the NEAR Neighbors registry (TESTNET)
// with a diverse ecosystem of fake neighbors, so the tag lists, the website
// embeds and (later) the Neighbors Spider can be tested at realistic scale
// BEFORE any mainnet deployment.
//
// What it does, per fake neighbor (from seed-data/fake-neighbors.json):
//   1. creates a subaccount  {suffix}.{ROOT_ACCOUNT}  funded with 0.05 NEAR
//      (the root account's public key is added as the subaccount's key, so
//      one keypair signs for everything)
//   2. calls register() on neighborly.testnet with the fake profile
//      (0.01 NEAR refundable deposit included in the funding)
//
// Idempotent: skips accounts that already exist / are already registered.
// A manifest of created accounts is written to seed-data/created-{ts}.json
// for the teardown script.
//
// Usage:
//   cd scripts && npm install
//   SEED_ACCOUNT_ID=you.testnet SEED_PRIVATE_KEY=ed25519:... node seed-testnet-neighbors.mjs
//   flags: --category=plumbing   only that category
//          --count=10            cap total neighbors
//          --dry-run             show the plan, touch nothing
//
// Testnet faucet: https://faucet.near.org (root needs ~3 NEAR for 48 seeds)
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import nearApi from "near-api-js";
import { parseSeedPhrase } from "near-seed-phrase";

const HERE = dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────────────────────
const NETWORK_ID = "testnet";
const NODE_URL = "https://test.rpc.fastnear.com";
const CONTRACT_ID = "neighborly.testnet";
const REGISTER_DEPOSIT = "10000000000000000000000"; // 0.01 NEAR (contract minimum)
const FUNDING = "50000000000000000000000"; // 0.05 NEAR per subaccount
const GAS = "100000000000000"; // 100 Tgas

const ROOT_ID = process.env.SEED_ACCOUNT_ID || "";
const ROOT_KEY = process.env.SEED_PRIVATE_KEY || "";
const ROOT_PHRASE = process.env.SEED_PHRASE || "";

// ── Args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : null;
};
const CATEGORY = flag("category");
const COUNT = flag("count") ? parseInt(flag("count"), 10) : 0;
const DRY_RUN = args.includes("--dry-run");

if (!ROOT_ID || !(ROOT_KEY || ROOT_PHRASE)) {
  console.error(
    "Set SEED_ACCOUNT_ID plus EITHER SEED_PRIVATE_KEY (ed25519:...) or SEED_PHRASE (12/24 words).",
  );
  process.exit(1);
}

// ── Load the fake ecosystem ───────────────────────────────────────────────
const all = JSON.parse(readFileSync(join(HERE, "seed-data", "fake-neighbors.json"), "utf8"));
let queue = CATEGORY ? all.filter((e) => e.category === CATEGORY) : all.slice();
if (COUNT > 0) queue = queue.slice(0, COUNT);

if (queue.length === 0) {
  console.error("Nothing to seed (check --category / --count / the JSON).");
  process.exit(1);
}

const subId = (entry) => `${entry.suffix}.${ROOT_ID}`;
const domain = (entry) => `${entry.suffix}.test`;

// Account-id sanity (NEAR rules: lowercase, 64 chars max total)
for (const e of queue) {
  const id = subId(e);
  if (id.length > 64 || !/^[a-z0-9._-]+$/.test(id)) {
    console.error(`Invalid subaccount id derived from suffix "${e.suffix}" → ${id}`);
    process.exit(1);
  }
}

console.log(`\n🌱 Seeding ${queue.length} fake neighbors on ${CONTRACT_ID}`);
console.log(`   root: ${ROOT_ID} · funding: 0.05Ⓝ each · domains: *.test\n`);

if (DRY_RUN) {
  for (const e of queue) {
    console.log(`   [dry] ${subId(e)}  (${e.category})  "${e.name}" <${domain(e)}>`);
  }
  console.log("\n(dry run — nothing was sent)");
  process.exit(0);
}

// ── Connect ───────────────────────────────────────────────────────────────────────────────────────
// Key from a raw private key OR derived from the seed phrase (SLIP-10, NEAR
// standard path m/44'/397'/0' — same derivation near-cli uses).
const privateKey = ROOT_KEY || parseSeedPhrase(ROOT_PHRASE).secretKey;
const keyPair = nearApi.KeyPair.fromString(privateKey);
const keyStore = new nearApi.keyStores.InMemoryKeyStore();
await keyStore.setKey(NETWORK_ID, ROOT_ID, keyPair);

const near = await nearApi.connect({
  networkId: NETWORK_ID,
  nodeUrl: NODE_URL,
  keyStore,
  headers: {},
});
const root = await near.account(ROOT_ID);
const rootPk = keyPair.getPublicKey();

// Small view-call helper (free RPC read)
const viewCall = async (method, args) => {
  const res = await fetch(NODE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "seed",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: CONTRACT_ID,
        method_name: method,
        args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
      },
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || "RPC error");
  const bytes = json?.result?.result;
  if (!Array.isArray(bytes)) return null;
  return JSON.parse(Buffer.from(bytes).toString("utf8"));
};

// ── Seed loop ─────────────────────────────────────────────────────────────
const created = [];
const skipped = [];
const failed = [];

for (let i = 0; i < queue.length; i++) {
  const e = queue[i];
  const id = subId(e);
  const label = `[${i + 1}/${queue.length}] ${id}`;

  try {
    // Already registered? (idempotent re-runs)
    const existing = await viewCall("get_agent", { account: id });
    if (existing) {
      console.log(`${label} — already registered, skipping`);
      skipped.push(id);
      continue;
    }

    // 1. Create the subaccount (funded, root's key on it) if missing.
    //    Account-not-found on view access_keys == doesn't exist yet.
    let accountExists = false;
    try {
      const akRes = await fetch(NODE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "seed",
          method: "query",
          params: {
            request_type: "view_access_key_list",
            finality: "final",
            account_id: id,
          },
        }),
      });
      const akJson = await akRes.json();
      accountExists = !akJson.error;
    } catch {
      accountExists = false;
    }

    if (!accountExists) {
      process.stdout.write(`${label} — creating subaccount… `);
      await root.createAccount(id, rootPk, FUNDING);
      console.log("✓");
    } else {
      console.log(`${label} — subaccount exists`);
    }

    // The subaccount signs with the SAME keypair (its only key).
    await keyStore.setKey(NETWORK_ID, id, keyPair);
    const sub = await near.account(id);

    // 2. Register the fake profile.
    process.stdout.write(`${label} — registering "${e.name}"… `);
    const tx = await sub.functionCall({
      contractId: CONTRACT_ID,
      methodName: "register",
      args: {
        name: e.name,
        domain: domain(e),
        agent_url: `https://${domain(e)}`,
        website_url: `https://${domain(e)}`,
        description: e.description,
        tags: e.tags,
        category: e.category,
        capabilities: e.capabilities,
        partner_note: e.partner_note,
      },
      gas: GAS,
      attachedDeposit: REGISTER_DEPOSIT,
    });
    console.log(`✓ tx ${tx.transaction.hash.slice(0, 18)}…`);
    created.push({
      account: id,
      suffix: e.suffix,
      category: e.category,
      name: e.name,
      domain: domain(e),
      registerTx: tx.transaction.hash,
    });

    // Write the manifest after every success (crash-safe).
    const manifestPath = join(HERE, "seed-data", `created-${NETWORK_ID}.json`);
    const prior = existsSync(manifestPath)
      ? JSON.parse(readFileSync(manifestPath, "utf8"))
      : [];
    const seen = new Set(prior.map((p) => p.account));
    writeFileSync(
      manifestPath,
      JSON.stringify([...prior, ...created.filter((c) => !seen.has(c.account))], null, 2),
    );
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    console.error(`${label} — FAILED: ${msg.slice(0, 300)}`);
    failed.push({ account: id, error: msg.slice(0, 300) });
  }
}

// ── Summary ───────────────────────────────────────────────────────────────
console.log(`\n──── done ────`);
console.log(`   created: ${created.length}`);
console.log(`   skipped: ${skipped.length} (already registered)`);
console.log(`   failed:  ${failed.length}`);
if (failed.length) {
  console.log("   failures:", JSON.stringify(failed, null, 2));
}
console.log(`\n   manifest: scripts/seed-data/created-${NETWORK_ID}.json`);
console.log(`   teardown: cd scripts && npm run teardown\n`);
