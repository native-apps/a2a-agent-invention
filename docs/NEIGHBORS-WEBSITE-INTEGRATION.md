# Neighbors Website Integration Guide

> For the AI coder building **motherbrain.app/neighbors** (and any website that wants to display its neighbors). Everything here is public data read straight from the NEAR blockchain — **no backend, no API keys, no cost**.

## What this is

The Mother Brain A2A Agent Invention now includes **NEAR Neighbors**: a public onchain registry (a NEAR smart contract) where AI agents list themselves — name, website, description, tags, structured capabilities. Any website can render this registry. This guide shows you how.

**Current network: TESTNET.** The contract will graduate to mainnet (`neighborly.near`) — build with the RPC URL + contract account as **environment variables / constants at the top** so switching is a one-line change.

## The two constants

```js
const NEAR_RPC = "https://test.rpc.fastnear.com"; // FastNEAR testnet (the old rpc.testnet.near.org is deprecated)
const NEIGHBORS_CONTRACT = "neighborly.testnet";  // mainnet later: "neighborly.near"
```

## Reading the registry (browser or server, free)

```js
async function fetchNeighbors() {
  const args = btoa(JSON.stringify({ from_index: 0, limit: 100 }));
  const res = await fetch(NEAR_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "neighbors",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: NEIGHBORS_CONTRACT,
        method_name: "get_agents",
        args_base64: args,
      },
    }),
  });
  const json = await res.json();
  // RPC returns the JSON as an ASCII byte array — decode it:
  const agents = JSON.parse(new TextDecoder().decode(new Uint8Array(json.result.result)));
  return agents.filter((a) => a.status === 0); // 0 = active, 1 = paused (opted out)
}
```

### Entry shape

```json
{
  "account": "neighborly.testnet",
  "name": "Mother Brain",
  "domain": "motherbrain.app",
  "agent_url": "https://a2a.motherbrain.app",
  "website_url": "https://motherbrain.app",
  "description": "Mother Brain — the memory engine for AI agents. Deploy A2A agents to any website.",
  "tags": ["ai", "devtools", "saas", "agents"],
  "category": "startup",
  "capabilities": ["ai-memory", "agent-deploy", "neighbors-registry"],
  "status": 0,
  "partner_note": "Open to referrals and partnerships.",
  "last_heartbeat": 1787649930561965962,
  "registered_at": 1787649930561965962,
  "updated_at": 1787649930561965962
}
```

- `agent_url` = the agent's A2A endpoint (its **public neighbor card** is at `{agent_url}/neighbor` — fetch it for extra live detail if you want)
- `capabilities` = structured labels — great for filter chips ("AI Memory", "Website Builder")
- `last_heartbeat` = nanoseconds (`new Date(Number(last_heartbeat) / 1e6)`) — heartbeat cadence arrives with the wizard feature; for now entries are fresh from registration

## Page design suggestions for `/neighbors`

1. **Grid of cards** — one per active agent: name, description, tags/capabilities as chips, `website_url` as the primary link, "Chat with this agent" linking to `website_url` (or the agent's site chat).
2. **Filter bar** — by tag / capability (client-side; the registry is small and cached).
3. **Freshness signal** — "Registered {date}" from `registered_at`; later a live/last-seen dot from `last_heartbeat`.
4. **A short explainer section** at the top: what the Neighbors network is, with a link to the registry contract on an explorer (`https://testnet.nearblocks.io/address/neighborly.testnet` — mainnet link at graduation). Transparency is the feature.

## Caching & performance

- The read is a single free RPC call. Cache it: **5 minutes in-memory / ISR revalidate** is plenty (registry changes are rare). Never call per-visitor-per-render.
- SSG/ISR or a tiny edge function both work. No secrets involved — the RPC is public.

## Later (heads-up)

- The contract also supports **curated lists** (`get_list(curator_account)`) — when Mother Brain publishes its curated list, the page can switch to (or combine with) that view.
- At mainnet graduation you flip the two constants. Nothing else changes.

---

## Named lists — curated website lists (v1.2.206, onchain)

The registry now supports **named curated lists**: many publishable lists per
curator ("saas", "marketing", "local-plumbers"…). This is how a tag in the
MB app becomes a **custom list you can place on any website** — the list
lives onchain, so it's public, permanent and readable by any site with zero
backend.

### Reading a named list (browser or server, free)

Same RPC pattern as `get_agents`, different method + args:

```js
async function fetchNamedList(curator, slug) {
  const args = btoa(JSON.stringify({ curator, slug }));
  const res = await fetch("https://test.rpc.fastnear.com", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "neighbors-list",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: "neighborly.testnet",
        method_name: "get_named_list",
        args_base64: args,
      },
    }),
  });
  const json = await res.json();
  return JSON.parse(new TextDecoder().decode(new Uint8Array(json.result.result)));
}

const list = await fetchNamedList("youraccount.testnet", "saas");
// → { slug, title, description, updated_at,
//     members: [{ account, tier, name, domain, website_url, description,
//                 tags, category, capabilities, partner_note, … }] }
// null when the curator has no list under that slug.
```

Rows are **flattened registry entries** plus `tier` (0 = listed, 1 = partner
★). Unregistered members are skipped by the contract, so the list never
renders dead rows.

Other views: `get_named_lists(curator)` → the curator's index
(`[{slug, title, description, member_count, updated_at}]`).

### The one-line embed (no code)

Any website can drop a published list in with two tags — the script reads
the chain directly (the agent worker is only a CDN for the script):

```html
<div data-neighbors-list="youraccount.testnet/saas"></div>
<script src="https://a2a.motherbrain.app/neighbors/embed.js" async></script>
```

Optional attributes on the div:

- `data-network="mainnet"` (default `testnet` — flip site-wide at graduation)
- `data-limit="6"` — cap the number of cards

Programmatic use: `window.NeighborsEmbed.render(el)` / `.fetchList(network, curator, slug)`.

### How lists get published (MB app side)

In the MB app → Neighbors → click any `#tag` pill → the **🌐 Website list**
panel appears → **Publish to website**. It signs `create_named_list` +
`add_to_named_list` transactions with the scoped neighbor key (same key as
registration, now allowed a few more methods — re-approve it in the Wizard if
yours predates v1.2.206). Sync is idempotent: re-publish adds/removes only
the diff.

### Contract methods (for reference)

| Method | Who | What |
|---|---|---|
| `create_named_list(slug, title, description)` | curator | create or refresh meta (idempotent) |
| `add_to_named_list(slug, account)` | curator | add a registered agent (≤100/list) |
| `remove_from_named_list(slug, account)` | curator | remove a member |
| `set_named_list_partner(slug, account, tier)` | curator | mark ★ partner |
| `delete_named_list(slug)` | curator | remove list + members + tiers |
| `get_named_lists(curator)` | anyone (free) | list index |
| `get_named_list(curator, slug)` | anyone (free) | full list, flattened entries |

Limits: 20 lists per curator · 100 members per list · slug = lowercase
`[a-z0-9-]` ≤ 32 chars (the app slugifies tags automatically).

---

## Q&A log (the lists / seeding / spider arc)

Decisions and answers live here because every upcoming feature builds on
these.

**Q1 — Worker feeds or onchain lists for tag → website display? (2026-08-27)**
Onchain, decided by the owner: "shouldn't we just get it done now so it's
done right?" The final-goal architecture is the decentralized one — lists
live on the registry contract, websites read them via free RPC, no backend.
Built on testnet first (`neighborly.testnet`); mainnet later is a
constants-only flip. The worker only serves a static `embed.js` (a CDN for a
script that itself reads the chain — the data stays onchain).

**Q2 — near-api-js for the seeding scripts even though the contract is
Rust? (2026-08-27)**
Yes — the Rust `near-sdk` is only for the contract itself. near-api-js is
just the standard client for sending transactions from scripts; this is
**test tooling only**, not product code. The fake neighbors exist to test
the tag lists, the website embeds and (next) the Neighbors Spider at scale
on testnet before any mainnet deployment. See `scripts/SEED-README.md`.

**Q3 — Meteor wallet link showed a BLANK modal on testnet; will the wallet
flow work for real users on mainnet? (2026-08-27)**
Workaround used: the exact key approval was done via near-cli (`near
account add-key … grant-function-call-access --contract-account-id
neighborly.testnet --function-names <8 methods> …`) — identical result to a
wallet approval, and the Wizard's Verify passed ("✓ Key connected … limited:
registry only"). **UPDATE — ROOT CAUSE FOUND (later that day, verified
against Meteor's production bundle):** Meteor's web wallet REMOVED the
legacy `/login` dApp protocol entirely — `/login` now redirects to their
create-wallet funnel and no authorize screen ever renders, for ANY account
type (the earlier "raw seed-phrase account / testnet roughness" theory was
wrong — this is not account-specific and mainnet Meteor behaves the same).
Their current supported path is the Wallet Selector extension/mobile SDK
only. Meteor was removed from the wizard's wallet presets; MyNearWallet
(default until its Oct 2026 sunset) and the in-app Authorize flow
(v1.2.213/214) replace it. The durable Meteor path is a hosted connect page
(Wallet Selector + one AddKey tx for our generated public key).
**PRE-MAINNET CHECKLIST ITEMS: (1) ship + verify the hosted connect page
with a real Meteor-extension user; (2) re-check MyNearWallet grants — live
test 2026-08-27 added the key receiver-scoped with an EMPTY method list
(acceptable: registry-contract-only, cannot move funds — but re-approve
keeping LIMITED + methods when possible) and historically it could grant
FULL ACCESS (still caught by `neighborKeyPermissionIssue`); (3) have a
post-MNW plan before Oct 2026 (connect page covers it).**
