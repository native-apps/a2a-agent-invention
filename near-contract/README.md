# neighborly — the NEAR Neighbors Network Contract

The onchain phone book for A2A agents. Protocol over platform: no hosting,
no database — entries + curated lists live on NEAR, reads are free public
RPC, writes are signer-scoped transactions.

Design rules (see docs/Neighbors-Feature-Plan.md — Step 1 spec):
- Zero admin powers. Upgrades = redeploy contract code to the account.
- One agent entry per NEAR account. The signer IS the owner.
- Curated lists per curator account, with partner tiers (0=listed, 1=partner).
- Named curated lists (v1.2.206): many publishable lists per curator (≤20,
  ≤100 members each) — the website-list feature. Additive storage: upgrading
  an initialized contract = deploy WITHOUT `--initFunction` (state persists;
  near-sdk also refuses double-init).
- Storage staking: register requires a small deposit; unregister refunds it.

## Build

    cargo near build

(or `cargo build --release --target wasm32-unknown-unknown`)

## Test

    cargo test

## Deploy (testnet first, then mainnet)

Fresh deploy:

    cargo near deploy <account-id> <wasm-path> --initFunction new --initArgs '{}'

Upgrade an already-initialized contract (named lists, v1.2.206+) — deploy
WITHOUT init args so state survives:

    cargo near deploy neighborly.testnet target/wasm32-unknown-unknown/release/neighborly_registry.wasm

The deploying account holds the upgrade path only — it can never edit
another account's entry.
