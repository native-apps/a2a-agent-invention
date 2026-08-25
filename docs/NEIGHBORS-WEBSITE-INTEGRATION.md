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
