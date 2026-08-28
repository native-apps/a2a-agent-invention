# NEAR Neighbors — Scale & Discovery Plan (the million-neighbor architecture)

> Status: **BRAINSTORM → DIRECTION LOCKED** (owner + agent session, 2026-08-28).
> Companion to `docs/NEIGHBORS-FEATURES.md` (the build ledger). This doc holds
> the scale architecture, the discovery model, and the full Q&A that shaped it.
> Owner's summary: *"Users keep THEIR discovered neighbors in their UI — they
> paid for it, they did the work. Discovery is a separate surface where they
> FIND new ones, one at a time or in bulk."*

---

## 1. The premise

Testnet holds ~50 seeded neighbors, so the panel can auto-load the whole
registry. **Mainnet aims for millions.** The contract's `get_agents` view
paginates (`from_index`/`limit`) but has **no server-side search/filter** —
exhaustive client-side reads are impossible at scale. Therefore:

- The UI must never imply "the network = the list I see."
- Every user's panel shows **their own collection**, not the chain.
- Discovery becomes an **explicit action** with multiple methods (§4).

**Architectural truth this plan is built on:** at scale, discovery happens
through **curation and indices, not exhaustive chain reads**. The chain is the
source of truth; indices (curated lists, Knick's database) are how you query
it — exactly like the open web vs. search engines.

## 2. The three tiers (business model)

| Tier | What | Who pays | Notes |
|---|---|---|---|
| **Protocol** — the NEAR Neighbors Network | Onchain registry + named lists + knock protocol | Nobody (gas only) | Open to all, even non-MB users. Public data, public reads. |
| **Console** — Mother Brain + A2A Agent Invention | Curate, tag, publish lists, embeds, heartbeat, knocks, CRM | MB license | The best operator experience for the network. |
| **Service** — Knick on market.near.ai | Paid discovery jobs with an enriched private DB | Per job, $NEAR | Better results than raw chain reads; no license needed. |

The network's openness is the moat's foundation, not a leak: public data +
open protocol means anyone CAN scrape (§ Q4/Q5) — the value we sell is trust,
convenience, live sync, and accumulated intelligence.

## 3. Terminology (avoid the "network" collision)

- **The Registry** — the global onchain phone book (millions).
- **My Network** — the user's own collected neighbors (their property).
- **Discovery** — the surface/process for finding new neighbors.

UI tabs: **NEIGHBORS NETWORK** (= My Network) and **NEIGHBORS DISCOVERY**.

## 4. Discovery methods (A–E)

- **A) Manual add** — enter a domain/account → fetch their onchain entry →
  add to My Network. Single-add flow.
- **B) Curated-list import** — from listing websites (maidensail.com,
  dang.ai, verifieddr.com, nicklaunches.com, …). Enter `{curator}/{slug}`
  (or a list URL) → `get_named_list` → import members. **One-click import
  for subscribers is the listing-site business hook.**
- **C) Direct chain access** — anyone can read the registry via RPC /
  NearBlocks (`nearblocks.io/address/nearneighbors.near`) with no license.
  Fine by design. (Terminal/power-user path; the future website documents it.)
- **D) Reciprocal knocks** — a Goal/Deal like *"knock and ask for an
  exchange of Neighbors lists"* or *"add us back to your neighbors."* Works
  TODAY via free-text knocks (the receiving agent can read its own published
  lists and reply). Organic, social, gas-cheap growth loop.
- **E) Hire Knick on market.near.ai** — paid jobs returning MORE results
  with BETTER accuracy, powered by Knick's enriched database (§6).

In-app Knick Knock (v1, free) and the user's own LLM sit alongside these:
the user's agent can search/knock using their configured LLM at their cost;
Knick-as-a-service is the no-license, higher-quality path.

## 5. The two-tab UI (the build)

> **Phase A status: BUILT (2026-08-28, pending release)** — tab bar (📁
> NEIGHBORS NETWORK / 🔍 NEIGHBORS DISCOVERY), My Network membership (favorites
> ∪ watched ∪ tagged ∪ discovered ∪ manual/import/browse adds ∪ self), and
> the Discovery tab with 🚪 Knick Knock + manual add (get_agent lookup) +
> curated-list import + registry browse table with bulk select.

### NEIGHBORS NETWORK (My Network)
- The user's collected neighbors: discovered, imported, manually added,
  favorites/watched/tagged — plus their own entry.
- Cards (visual curation) + optional table toggle for bulk management.
- Tags = curated lists → publish onchain → embeds (existing flows).
- **This is the listing-websites' dream feature**: they curate category
  lists onchain; their subscribers import them in one click; embeds render
  live on their sites.

### NEIGHBORS DISCOVERY
- The action surface: run 🚪 Knick Knock (moves here), browse/search the
  registry (paginated; becomes indexer-backed at scale), manual add,
  curated-list import, hire-Knick entry point (Phase C).
- **Clean table UI (rows/columns) for bulk operations** — checkboxes,
  select-all, bulk "add to My Network" / bulk knock. Single ops too.
- Knock composer per row or in bulk with a goal like
  *"Add us back to your neighbors."*

### Data flow
Discovery (any method) → results land in My Network (the discovered pool is
the staging area inside it) → owner tags/curates → publishes lists onchain.

## 6. Knick's enriched private database (market.near.ai)

- Onchain stays a **lean phone book** (name/domain/tags/capabilities/status).
- Knick (market side) accumulates **learned criteria per neighbor** across
  ALL jobs: response quality, verified (vs. declared) capabilities,
  responsiveness, historical answers. Every job enriches it; every future
  job benefits — a data flywheel (Google-over-the-web pattern: open data,
  proprietary index).
- Keeps the chain lean (no enrichment onchain = low storage/gas at millions
  scale) AND makes paid Knick strictly more valuable than free raw reads.
- **GO-TO-THE-SOURCE (owner directive, 2026-08-28):** market-Knick ALWAYS
  reads the $NEAR Neighbors Network mainnet onchain FIRST on every job —
  that's where the real neighbors, new registries, and updated details live —
  then upserts/merges into his DB. Onchain is truth; the DB is cache +
  enrichment that must never drift.
- Since market.near.ai agents speak A2A, **Knick is a Neighbor**: the A2A
  invention UI can add Knick and hire him via knocks; payment flows through
  market.near.ai's billing ($NEAR) — exact API researched at integration
  time (Phase C).

## 7. Storage evolution (durability)

- Today: prefs (favorites/goals/deals/sops/tags/discovered) in localStorage.
- Problem: **paid results must never be lost** ("they paid for it, they did
  the work"). localStorage dies with the browser.
- Plan (owner directive, 2026-08-28): a **local PGrust instance** per
  invention at
  `~/.mother-brain/inventions/a2a-agent/neighbors-network/`, accessible to
  all MB projects using the invention. PGrust is pre-production — if it
  fails, fall back to **standard Postgres** (same path/pattern). **No new
  Supabase.** localStorage remains the cache. Phase B.

## 8. Shareable Agent Cards (growth loop)

- Every agent gets a shareable identity: `$NEAR Neighbors ID`
  (`account.near`) + card link (e.g. `nearneighbors.network/a/{account}`,
  OG-unfurled) + **"Add to my Neighbors"** deep link.
- Can reuse the existing embed-card renderer. Post on socials/websites →
  one-click add. Every shared card is an ad for the network. (Website
  project scope; design now, build later.)

## 9. Watch list

- **PGRUST** (github.com/malisper/pgrust, pgrust.com) — Rust Postgres
  rebuild, WASM build available, NOT production-ready. **Owner directive
  (2026-08-28): try it FIRST for the local My Network storage (Phase B);
  fallback = standard Postgres.** The WASM angle may also let Knick's DB run
  on Workers when self-hosted.

## 10. Q&A log (2026-08-28 session)

- **Q: Knick Knock with own LLM vs. Knick on market.near.ai?**
  A: In-app = deterministic scoring over public onchain data, free, your
  data/your LLM/your cost. Market-Knick = enriched DB + LLM re-ranking +
  pay-per-job, no license. Free tier works; paid tier works better.
- **Q: Are curated lists public once deployed?**
  A: Yes — `get_named_lists`/`get_named_list` are public view calls; anyone
  can read or enumerate them (Knick v1 already does). Public by design.
- **Q: Can we stop scraping?**
  A: No — nor should we. The listing-site pitch is trust (tamper-proof
  onchain identity), live sync, one-click subscriber import, and partner
  tiers — convenience and distribution, not access control.
- **Q: Does Knick's private DB reduce onchain size and add value?**
  A: Yes and yes — see §6 (lean chain + flywheel).
- **Q: Can the A2A UI hire market-Knick and pay there directly?**
  A: Conceptually yes (Knick is an A2A neighbor); billing specifics depend
  on market.near.ai's payment API — research at Phase C.
- **Q: Shareable Agent Card?**
  A: Yes — §8. Strong growth loop.
- **Q: Where do Knick results/history live?**
  A: v1: the ✨ Knick pool (localStorage prefs). Phase B: durable Supabase.
- **Q: What does Knick return today?**
  A: Matches with score + reasons + matched goals + listed-by signal — the
  "initial round" (bulk targeting). Phase 2 active knocking = real
  conversations with specific questions. Owner's mental model confirmed
  correct.
- **Q: Can users' own agents 'search the network onchain'?**
  A: Today: paginated reads + client-side filtering only — fine at hundreds,
  broken at millions. Scale answer: curation (lists), indices (Knick/website
  explorer), and eventual contract-v2 filtered views. §1.

## 11. Phased build plan

- **Phase A (two-tab UI): BUILT (2026-08-28, pending release)** — see §5.
  Remaining Phase A follow-ups: removal UI for stored adds, knock-from-table
  (rides Phase 2 active knocking), paginated browse at scale.
- **Phase B: durability** — My Network → agent's Supabase (localStorage as
  cache); export/import (JSON).
- **Phase C: market.near.ai Knick** — enriched DB, hire-from-UI, billing
  research, hosting decision (market vs self-host Cloudflare), pgrust
  re-check.
- **Phase D: nearneighbors.network website** — public explorer, shareable
  cards, terminal/API docs, embed generator.

## 12. Open questions

- Contract v2: filtered/paginated search views, or indexer-only? (revisit at
  ~10k neighbors)
- Knock politeness spec finalization (caps/cooldowns/identity) — see
  NEIGHBORS-FEATURES.md design flags.
- Market.near.ai billing API shape (Phase C research).
- Does My Network sync across devices via the agent's Supabase only, or also
  a future nearneighbors account? (Phase B/C)
