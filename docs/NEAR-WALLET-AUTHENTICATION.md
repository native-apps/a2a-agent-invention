# NEAR Wallet Authentication — the Wizard's authorization paths

> Investigated & documented 2026-08-29 (evidence-based: wallet source code, live
> probes, official sunset pages). This is the reference for how A2A Agent Invention
> users authorize their scoped registry key — and the plan for the future.
> Companion docs: `recipes/a2a-setup.md` (Step 8), `settings/near-wallet.ts` (code).

## The problem in one paragraph

The wizard needs a **scoped function-call access key** on the user's NEAR account —
limited to the registry contract's 8 methods (`register`, `update`, `heartbeat`,
named-list methods) on `nearneighbors.near`. The wizard generates the keypair
in-app, then a WALLET must approve adding that public key to the account onchain.
The wizard's Verify step (live RPC `access_key_list`) refuses FullAccess keys and
wrong-contract keys by design. So: any wallet auth we use must support **adding
function-call keys with a receiver + method list**.

## The ladder (REVISED 2026-08-29 — owner pushed for in-app; he was right)

1. **Today → Oct 2026: MyNearWallet (mainnet)** — the default preset, works
   in-app via the legacy `/login` URL protocol. Verified end-to-end live.
2. **THE FINAL SOLUTION: IN-APP NEAR AUTH** — the `@fast-auth-near/browser-sdk`
   runs INSIDE the wizard's neighbors slide (no hosted page needed!):
   "⚡ Sign in with Google / Email / passkey" → Auth0 login (redirect via the
   user's OWN worker done-page — same battle-tested pattern as wallet-done) →
   identity derives a NEAR account key (MPC-secured, no seed phrase) → wizard
   requests ONE signature: AddKey of OUR scoped registry key → existing Verify
   step confirms → Register. Depends only on Auth0 + NEAR MPC contracts +
   per-user workers — nothing of ours to keep online. If we die, the network
   lives (registry is onchain; entries/keys/lists survive).
3. **Final fallback: near-cli** (terminal). MNW preset retires at sunset.

**Key facts (docs.auth.near.org, verified 2026-08-29):** gasless txs via
DELEGATE ACTIONS (users transact with zero NEAR); onchain guard contract
verifies the Auth0 JWT before any MPC signature; deterministic identity →
key; React/Browser/ReactNative SDKs; TESTNET FULLY OPEN (no approval) —
buildable today; mainnet = approved Auth0 client ID only.

**Build notes (design decisions for the build session):** Auth0 callback
strategy — popup vs full-page redirect via worker `/neighbors/auth-done`
(reuses the wallet-done `?return=` localhost validation pattern); Auth0
client_id is embedded in the wizard (public by nature); per-user worker
origins vs registered callback URLs — resolve during testnet build. Email-loss
containment: login needed ONCE (AddKey); ongoing ops run on our scoped key
(incl. unregister + refund).

## Evidence: every wallet investigated

| Wallet | URL `/login` flow? | Scoped keys? | Verdict | Evidence |
|---|---|---|---|---|
| **MyNearWallet** | ✅ full legacy protocol (`contract_id`, `method_names`, `success_url`) | ✅ (keep LIMITED — its toggle is loose, can grant FullAccess or drop methods; Verify catches both) | **USE NOW** — sunsets Oct 31 2026 | Verified live e2e 2026-08-27; sunset page scraped 2026-08-29 |
| **Meteor** | ❌ `/login` removed — redirects to create-wallet funnel, no authorize screen ever renders | ✅ via its widget/postMessage only | Dead for URL flow | Verified against Meteor production bundle 2026-08-27 |
| **Intear** (`wallet.intear.tech`) | ⚠️ `/login` exists but parses **ONLY `public_key`** — no `contract_id`, no `method_names`, no `success_url`. Adds a **FULL-ACCESS key** behind a "type CONFIRM" danger input (their own UI labels it dangerous: `DangerConfirmInput`; security log: *"Added full access key on /login"*) | ✅ scoped keys exist ONLY via their Wallet Selector widget (`connected_apps_context` w/ `requested_method_names`) | **NEVER for our URL flow** — wizard Verify would reject the full-access key (and the key would be dangerous). Becomes usable through our connect page | `web/src/pages/login.rs` read in full 2026-08-29 (INTEARnear/wallet repo) |
| **HERE** (`wallet.here.org`) | ❌ login URL returns `ERR_EMPTY_RESPONSE` | unknown | Dead for URL flow | Live probe 2026-08-28 |
| **wallet.near.org** | — | — | Funnels to Meteor — same dead end | Verified 2026-08-28 |
| **Ledger** | n/a (hardware) | ✅ | Works via connect page (Wallet Selector has ledger module) + near-cli | — |

## MyNearWallet sunset — will it "auto-swap"? **No.**

From the official sunset page (mynearwallet.com/sunset, updated June 2026):
- **Jul 2026**: awareness phase. **Aug–Sep**: guided migration flows appear.
- **Oct 31, 2026**: deprecation; **Oct–Dec 2026**: "reduced functionality",
  becomes a **migration & recovery-focused experience**.
- **2027+**: static informational page.
- Meteor is the *recommended migration path* (same maintainers) — but Meteor
  does not support the legacy `/login` URL protocol.

**Conclusion:** `app.mynearwallet.com/login` will NOT redirect to a working
equivalent. It degrades into a migration shell. Our URL-based flow dies with
MNW's full functionality (somewhere in Oct–Dec 2026). Deadline for the connect
page: **before Oct 31, 2026** — comfortably inside our polish phase.

## The hosted connect page — DEMOTED to optional (2026-08-29)

The in-app NEAR Auth plan above replaces the hosted page as the primary
solution. A `nearneighbors.network` site remains OPTIONAL LATER (marketing +
public explorer + maybe a Wallet Selector page for crypto-native users who
prefer it; Web4 is a candidate host for that — see below). It is NOT on the
auth critical path. The original connect-page spec (Wallet Selector page +
NEAR Auth on CF Pages) is retained below for when we build the website.

**Stack (two auth paths on one page — full coverage):**
1. **Wallet Selector** (`@wallet-selector/core` + meteor / intear / here /
   ledger / my-near-wallet modules) — for users who already have a crypto wallet.
2. **NEAR Auth** (`@fast-auth-near/*` SDKs — near.org's official solution,
   docs.near.org/web3-apps/tutorials/near-auth) — for everyone else: sign in
   with **Google / Apple / email / passkeys, no seed phrase, no wallet
   extension**. Auth0 login + MPC network (`v1.signer`) secures the key — the
   same login always controls the same NEAR key. Its signer exposes
   `signAndSendTransaction`, so it can sign our AddKey scoped-key transaction
   exactly like a Wallet Selector wallet.

**NEAR Auth caveats:** mainnet requires APPROVED Auth0 credentials (apply:
   form.typeform.com/to/VWHjf3HV — free, but a wait; testnet is open for
   dev) — **apply early**. Cost mechanics: the RELAYER sponsors GAS
   (broadcasts for the user; long-term limits undocumented — verify at
   integration), but the registry's 0.01Ⓝ register DEPOSIT is value attached
   to the tx — relayers cannot sponsor it; every registering account needs
   0.01Ⓝ balance. Optional future: WE sponsor deposits — they're REFUNDABLE
   on unregister (revolving float; cost = abandoned registrations only) —
   possible "first N neighbors free" growth lever.

**Hosting decision (2026-08-29, verified):** Cloudflare Pages on
   `nearneighbors.network` — NOT Web4 — for the auth critical path. Web4
   (web4.near.page, same author as our FastNEAR RPC) is legit: contracts
   serve sites via `web4_get`, free `account.near.page` subdomains, NEARFS
   for big files, working wallet login (lands.near.page shows HERE/MNW/Meteor
   buttons). But: community gateway is "free for now, might pay by traffic";
   roadmap still has login/tx polish + wallet-selector support unchecked; the
   cookie-based app-key signing is a FUTURE item (can't do our scoped AddKey
   today); Auth0 callbacks want a stable origin we own; subaccounts
   unsupported. Web4 = Phase-D candidate for the public explorer/website
   (served BY the chain, ABOUT the chain — great protocol-over-platform
   story) or as a decentralized mirror of the connect page.

**Flow:**
1. Wizard generates the neighbor keypair (already built) and opens:
   `https://nearneighbors.network/connect?public_key=ed25519:…&contract=nearneighbors.near&methods=register,update,…&success=<worker done-page>`
2. User connects ANY wallet (Wallet Selector) **or** signs in with Google/email (NEAR Auth) on our page
3. Our page signs an **AddKey(FunctionCall{ receiver_id: nearneighbors.near, method_names })** transaction via the connected signer — scoped by construction, no dangerous toggles
4. Key lands onchain → page shows ✓ + "Return to Mother Brain"
5. Wizard **Verify** (already exists, unchanged — it's wallet-agnostic RPC)

**Wizard-side change:** small — a new "Authorize on nearneighbors.network"
default path that opens OUR page URL instead of a wallet `/login` URL. Verify +
Register flows untouched.

**Effort:** ~one focused build session for v1 (page + selector + AddKey +
wizard button) + a cross-wallet test pass. Rides one release. Maintenance
near-zero (Wallet Selector maintains the wallet adapters).
**Bonus:** Wallet Selector gives mobile-wallet deep-linking for free — better
mobile UX than the legacy URL protocol ever had.

**Domains (owner owns all three):** `nearneighbors.network` · `nearneighbors.com` · `nearneighbors.xyz`
- My lean: **nearneighbors.network** = the network's home (connect page at
  `/connect`, future public explorer/website). `.com` → marketing redirect
  later. `.xyz` → spare/redirect. Final call = owner's.

## Q&A log

**Q1 — Can we just use wallet.intear.tech? (asked twice, 2026-08-28/29)**
No — source-verified: their `/login` adds full-access keys only (danger-confirm
gated), ignores contract/method scoping. The wizard would refuse the key. Intear
joins the party via the connect page (their widget flow DOES scoped keys).

**Q2 — Will MyNearWallet auto-swap when replaced? (2026-08-29)**
No — it degrades into a migration/recovery shell (Oct–Dec 2026), then a static
page (2027+). Meteor (the migration target) doesn't support our URL protocol.
Deadline for connect page: before Oct 31, 2026.

**Q3 — How much work is our own auth? (2026-08-29)**
~one focused session — a single Wallet Selector page on Cloudflare Pages + a
small wizard change. Spec above. The hardest part (wallet UX) is outsourced to
Wallet Selector.

**Q5 — Is there a near.org official solution for easy auth? (2026-08-29)**
YES — **NEAR Auth** (docs.near.org/web3-apps/tutorials/near-auth, the evolved
FastAuth): Web2 login (Google/Apple/email/passkey) → MPC-secured NEAR key →
can sign our AddKey scoped-key tx. It slots into the connect page as the
"no wallet needed" path alongside Wallet Selector. Mainnet needs an Auth0
credential application (apply early — free). This is the answer to "make new
Neighbor auth easy" — a brand-new user with zero crypto setup can register.

**Q6 — Should we use nearai/near-mcp? (2026-08-29)**
No — investigated: it's an MCP server exposing NEAR accounts/txs/keys to LLMs
(generic chain access). We don't use it: (a) our reads are direct free RPC
(already built); (b) our signing is purpose-built scoped-key code (already
built); (c) its security model is wrong for us — local UNENCRYPTED keystore +
models handling private keys (import_account) — exactly what our design
refuses; (d) stale (last commit May 2025). Revisit ONLY if Knick on
market.near.ai later wants MCP-shaped NEAR tooling (we'd build our own thin
MCP exposing neighbors_search/knock, not generic account access).

**Q7 — Why can't auth live directly in the MB app? (2026-08-29, owner challenge)**
IT CAN — plan revised. The wizard already does in-app wallet auth (MNW URL
flow); the final solution runs the NEAR Auth browser SDK inside the wizard
itself with the redirect-back handled by the user's own worker. No hosted
page needed; nothing of ours on the critical path. The hosted page idea was
over-anchored; owner was right.

**Q8 — The fiat wall / no-bank problem (2026-08-29, owner's story)**
Most people can't get fiat→crypto (owner: blocked from every exchange, no
KYC possible, homeless, no phone — friends sending NEAR directly was the only
path ever). SOLUTION = owner's invite-gift idea (NEAR's native linkdrop
pattern): "Invite a Neighbor" in the Neighbors UI — owner gifts ~0.05Ⓝ →
claim link → friend gets a funded account → pairs with in-app NEAR Auth
(zero wallet, zero KYC, zero exchange). Deposit is refundable = revolving
float. Contract v2 idea: sponsored `register_for()` method removes the last
balance requirement. near.email investigated: it's an EMAIL product (wallet
= mailbox by OutLayer), not an on-ramp — not our solution.

**Q4 — Why not signature-only auth (no access key)? (2026-08-29, design note)**
The wizard signs register/update/heartbeat transactions itself later (via RPC)
— that requires a persistent onchain access key, not one-off signatures. AddKey
via a wallet is the right architecture; no shortcut exists.

## Status / next actions

- [x] Investigate all wallets (evidence table above)
- [x] Investigate NEAR Auth (near.org official) → slots into connect page as the no-wallet path
- [x] Investigate nearai/near-mcp → not used (wrong security model, stale; revisit for Knick only)
- [ ] **Apply for NEAR Auth mainnet Auth0 credentials** (free form — do early, it's a wait). READY TO APPLY: project = NEAR Neighbors Network onchain AI-agent registry; use case = Web2 login → scoped AddKey on nearneighbors.near; callback = https://nearneighbors.network/connect
- [x] Web4 investigated (2026-08-29) → not for auth critical path; Phase-D website/mirror candidate
- [x] MNW mainnet preset shipped (v1.2.220) — registrations unblocked NOW
- [ ] First mainnet registrations (anakimota.near + motherbrain.near) via MNW
- [ ] Owner picks the primary domain (lean: nearneighbors.network)
- [ ] Build connect page v1 (polish phase, before Oct 2026) + wizard button
- [ ] Retire MNW preset at sunset; near-cli stays the final fallback
