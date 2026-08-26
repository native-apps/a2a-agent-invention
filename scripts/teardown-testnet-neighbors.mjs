#!/usr/bin/env node
// ---------------------------------------------------------------------------
// teardown-testnet-neighbors.mjs — undo the seed: for every account in
// seed-data/created-testnet.json → unregister (refunds the 0.01Ⓝ deposit)
// → delete the subaccount (sweeps the remaining balance back to the root).
//
// Usage (same env as the seeder):
//   SEED_ACCOUNT_ID=you.testnet SEED_PRIVATE_KEY=ed25519:... node teardown-testnet-neighbors.mjs
//   flags: --dry-run   show what would be removed
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import nearApi from "near-api-js";
import { parseSeedPhrase } from "near-seed-phrase";

const HERE = dirname(fileURLToPath(import.meta.url));

const NETWORK_ID = "testnet";
const NODE_URL = "https://test.rpc.fastnear.com";
const CONTRACT_ID = "neighborly.testnet";
const GAS = "100000000000000"; // 100 Tgas

const ROOT_ID = process.env.SEED_ACCOUNT_ID || "";
const ROOT_KEY = process.env.SEED_PRIVATE_KEY || "";
const ROOT_PHRASE = process.env.SEED_PHRASE || "";
const DRY_RUN = process.argv.includes("--dry-run");

const MANIFEST = join(HERE, "seed-data", `created-${NETWORK_ID}.json`);

if (!existsSync(MANIFEST)) {
  console.error(`No manifest at ${MANIFEST} — nothing to tear down.`);
  process.exit(1);
}
if (!ROOT_ID || !(ROOT_KEY || ROOT_PHRASE)) {
  console.error("Set SEED_ACCOUNT_ID plus SEED_PRIVATE_KEY or SEED_PHRASE (same as the seeder).");
  process.exit(1);
}

const rows = JSON.parse(readFileSync(MANIFEST, "utf8"));
console.log(`\n🧹 Tearing down ${rows.length} seeded neighbors (root: ${ROOT_ID})\n`);

if (DRY_RUN) {
  for (const r of rows) console.log(`   [dry] ${r.account} (${r.category})`);
  process.exit(0);
}

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

const remaining = [];

for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  const label = `[${i + 1}/${rows.length}] ${r.account}`;
  if (!r.account.endsWith(`.${ROOT_ID}`)) {
    // Never touch accounts this root doesn't own (defensive).
    console.log(`${label} — not a subaccount of the root, skipping`);
    remaining.push(r);
    continue;
  }
  try {
    await keyStore.setKey(NETWORK_ID, r.account, keyPair);
    const sub = await near.account(r.account);

    // 1. Unregister (refunds deposit) — tolerate "Not registered".
    process.stdout.write(`${label} — unregister… `);
    try {
      await sub.functionCall({
        contractId: CONTRACT_ID,
        methodName: "unregister",
        args: {},
        gas: GAS,
      });
      console.log("✓");
    } catch (err) {
      const msg = String(err?.message || err);
      if (/Not registered/i.test(msg)) {
        console.log("(already unregistered)");
      } else {
        throw err;
      }
    }

    // 2. Delete the subaccount; balance lands back on the root.
    process.stdout.write(`${label} — delete account… `);
    await sub.deleteAccount(ROOT_ID);
    console.log("✓");
  } catch (err) {
    const msg = String(err?.message || err).slice(0, 300);
    console.error(`${label} — FAILED: ${msg}`);
    remaining.push(r);
  }
}

if (remaining.length === 0) {
  // Rotate the manifest aside so re-seeding starts fresh.
  renameSync(MANIFEST, `${MANIFEST}.torn-${Date.now()}`);
  console.log(`\n✨ All cleaned. Manifest archived.\n`);
} else {
  writeFileSync(MANIFEST, JSON.stringify(remaining, null, 2));
  console.log(`\n${remaining.length} remain in the manifest — re-run to retry.\n`);
}
