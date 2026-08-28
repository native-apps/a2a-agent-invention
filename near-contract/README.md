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

Notes:
- cargo-near ≥0.11 runs an ABI-schema generation pass that requires
  `JsonSchema` on public method types — the derives + hand-written impls in
  `src/lib.rs` exist for that. Do NOT enable near-sdk's `abi` feature in
  Cargo.toml: it is host-only and breaks wasm32 builds, and `AccountId`
  only implements `JsonSchema` under it — which is exactly why the
  `{account, ...}` flattened views carry hand-written schemas.
- Output wasm: cargo-near ≥0.11 → `target/near/neighborly_registry.wasm`
  (optimized, ~226KB); plain cargo →
  `target/wasm32-unknown-unknown/release/neighborly_registry.wasm` (larger,
  ~306KB — deploys fine, stakes more storage).
- Tests: `cargo test` — 13/13.

## Deploy (MAINNET live · testnet legacy)

The live network since 2026-08 is **mainnet** — contract account
`nearneighbors.near`. Testnet (`neighborly.testnet`) remains for manual
tests only (scripts/seed-testnet-neighbors.mjs etc.).

Fresh deploy (mainnet — init required on a virgin account):

    cargo near deploy nearneighbors.near target/wasm32-unknown-unknown/release/neighborly_registry.wasm --initFunction new --initArgs '{}'

    # choose `mainnet` when cargo-near prompts for network (or use
    # near-cli-rs with: network-config mainnet sign-with-keychain send)

Upgrade an already-initialized contract (named lists, v1.2.206+) — deploy
WITHOUT init args so state survives:

    cargo near deploy nearneighbors.near target/wasm32-unknown-unknown/release/neighborly_registry.wasm

Legacy testnet (manual tests only):

    cargo near deploy neighborly.testnet target/wasm32-unknown-unknown/release/neighborly_registry.wasm

The deploying account holds the upgrade path only — it can never edit
another account's entry.
