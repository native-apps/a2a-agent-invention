# Testnet Seeding — the fake Neighbors ecosystem

Test tooling for the NEAR Neighbors Network (`neighborly.testnet`). Populates
a realistic mock community (48 fake neighbors across 16 categories) so the
**tag lists → website embeds** flow and the upcoming **Knick** discovery agent can
be battle-tested on testnet BEFORE any mainnet deployment.

> Not product code. near-api-js here is just the standard JS client for
> sending chain transactions from scripts — the contract itself stays Rust.

## One-time setup

    cd scripts
    npm install          # near-api-js + near-seed-phrase (only dependencies)

The seeder funds each fake neighbor from the ROOT account (~0.05Ⓝ each —
~3Ⓝ for all 48). **Recommended root: `neighborly.testnet`** (the contract
account, seed-phrase based — you already have the phrase). Top it up at
https://faucet.near.org if it runs low. Check its balance first:

    near account view-account neighborly.testnet network-config testnet

## Seed
From `neighborly.testnet` (seed phrase):

    SEED_ACCOUNT_ID=neighborly.testnet \
    SEED_PHRASE='universe bar tunnel ...' \
    node seed-testnet-neighbors.mjs

Or with any account's raw private key:

    SEED_ACCOUNT_ID=yourname.testnet \
    SEED_PRIVATE_KEY=ed25519:... \
    node seed-testnet-neighbors.mjs

Useful flags:

- `--dry-run` — print the plan, send nothing
- `--category=plumbing` — only one category
- `--count=10` — cap the number of neighbors

What it does per neighbor: creates `suffix.yourname.testnet` (funded 0.05Ⓝ,
key = your root key) → calls `register()` with the fake profile (0.01Ⓝ
refundable deposit). Idempotent — re-running skips what's already registered.
All fake domains end in `.test` (RFC-reserved, never resolve) so nothing can
ever knock a real website.

## Categories covered (16 × 3 each)

branding · marketing · seo · blockchain-dev · saas-directory · ai-ml ·
cybersecurity · field-service · home-repair · plumbing · police-station ·
fire-emergency · hvac · real-estate-broker · private-school · community-org

## Teardown

    SEED_ACCOUNT_ID=neighborly.testnet \
    SEED_PHRASE='universe bar tunnel ...' \
    node teardown-testnet-neighbors.mjs

Unregisters every seeded account (deposit refunds back) and deletes the
subaccounts (remaining balance sweeps back to your root).

## Manifest

`seed-data/created-testnet.json` — every created account (written after each
success, crash-safe). The teardown script reads exactly this file.
