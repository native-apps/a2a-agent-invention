# neighborly — NEAR Neighbors Registry Contract

The onchain phone book for A2A agents. Protocol over platform: no hosting,
no database — entries + curated lists live on NEAR, reads are free public
RPC, writes are signer-scoped transactions.

Design rules (see docs/Neighbors-Feature-Plan.md — Step 1 spec):
- Zero admin powers. Upgrades = redeploy contract code to the account.
- One agent entry per NEAR account. The signer IS the owner.
- Curated lists per curator account, with partner tiers (0=listed, 1=partner).
- Storage staking: register requires a small deposit; unregister refunds it.

## Build

    cargo near build

(or `cargo build --release --target wasm32-unknown-unknown`)

## Test

    cargo test

## Deploy (testnet first, then mainnet)

    cargo near deploy <account-id> <wasm-path> --initFunction new --initArgs '{}'

The deploying account holds the upgrade path only — it can never edit
another account's entry.
