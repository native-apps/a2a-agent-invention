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

> **Phase A status: BUILT + user-feedback pass (2026-08-28, pending release)**
> — tab bar (📁 NEIGHBORS NETWORK / 🔍 NEIGHBORS DISCOVERY); My Network
> membership (favorites ∪ watched ∪ tagged ∪ manual/import/browse adds ∪
> self — discoveries NO LONGER auto-join); Discovery tab compacted into
> sub-tabs (🚪 Knick w/ prompt + Goal/Deal intent chips | ＋ Manual | 📥
> Import) over the **📋 Discovery List** — the accumulated store of EVERY
> discovery run (newest-first, Tags + Capabilities + Date Discovered
> columns; registry snapshot stamped per discovery). The Discovery List is
> the future PGrust/Postgres store.

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

## 6a. The two knockers — Knick's Scout Knock vs the owner's agent

**THE 3-STAGE WORKFLOW (owner decision, 2026-08-28 — supersedes the
one-button model):**

1. **🔭 Go Discover** — crawl + score the network against selected intent
   (Goals/Deals/prompt). Results accumulate in the Discovery List. SILENT —
   nothing is sent to anyone.
2. **🚪 Knick Knock (the notification)** — fires ONLY when a neighbor is
   added to My Network — on BOTH paths: single **＋ add** and bulk **Add N**
   (bulk fires one ping per neighbor, politely spaced ~350ms). Knick pings
   that neighbor: "you were discovered by (and added to) [owner]'s Neighbors
   Network — go say hello and introduce your agents." Gating on Add =
   discovery is free and silent; the ping is an explicit, owner-initiated
   act. **SENDER SHIPPED (2026-08-28, v1)**: typed knock `type:
   "knick-notify"` from all Add paths (single/bulk/import/manual) with
   why-matched + CTA; knockReady-gated; ping failures never block the add.
   Until the receiver typed-branch ships, receiving agents auto-reply
   conversationally (acceptable v1).
3. **The owner's agent knocks (the representation)** — real knocks on
   approved neighbors in NEIGHBORS NETWORK with Goals/Deals context (custom
   messages, composer upgrade) + the heartbeat's slow-drip outreach.

**Division of labor (owner insight, 2026-08-28):** Knick does NOT
represent the owner's business — he's a scout. The owner's agent is the
representative. UI note: 🔭 = discovery; 🚪 = knocking, always.

| | Knick (Scout Knocks) | Owner's agent (Representative knocks) |
|---|---|---|
| Purpose | open doors: notify, match, request intros | walk through: discuss, negotiate, deal |
| Depth | one structured ping | full conversations (SOPs, autonomy levels) |
| Context | match reasons + public cards | goals, deals, SOPs, thread memory |
| Volume | bulk (capped, cooldowns) | one-at-a-time heartbeat drip or manual |

**The Scout Knock (Phase 2 design):** a distinct knock TYPE (e.g.
`type: "scout"`) signed by Knick, never by the owner's agent. Payload:
discovered-by (the owner), why-matched (the discovery reasons — Knick
generates these already), optional intro-request ("Neighbor A's goals match
your capabilities — interested in an intro?"). The receiver's agent can
ack / accept-intro / ignore; an ACCEPTED intro hands off to the owner's
agent for the real knock. Knick never negotiates, quotes terms, or commits.

**Discovery notifications + the Inbox (owner spec, 2026-08-28):**
- TRIGGER: only "＋ Add to My Network" (never on bare discovery)
- DELIVERY (v1 SHIPPED 2026-08-28, sender + receiver): sender = typed
  knock (`type: "knick-notify"`) fired on EVERY Add path (single/bulk/
  import/manual, 350ms politeness spacing); receiver = worker typed-branch
  (stored WITHOUT LLM auto-reply, static ack, `kind: "knick-notify"`
  metadata) + `GET /neighbor/notifications` + the 📬 INBOX in the console
  header (unread badge, popup list, click → open thread, inboxSeen persisted)
  — needs a worker REDEPLOY on both agents to go live.
- Payload: discovered-by (owner identity + registry card:
  name/domain/description), why-matched (the discovery reasons), CTA
  ("go say hello and introduce your agents").
- RECEIVER UI: a button right of the "NEIGHBORS CONSOLE" header title with
  an unread-count badge → vertical popup = mini inbox of "each new
  Neighbor that added you to their Network" — item actions: open the
  thread in Conversations / knock back. Recipients can be FIRST to reach
  out — this drives mutual adding.
- SETTINGS: the popup later hosts the Discovery-system controls (mute
  scouts, cooldowns — the anti-spam surface).
- Worker side needs: typed-knock branch + GET /neighbor/notifications for
  the badge (backend changes + redeploy — the real Phase 2 build).
- Onchain receipts (a published "network" list) = optional graduation
  feature later; the ping is a courtesy push of what's public anyway.

**Anti-spam framework (DEFERRED by owner 2026-08-28 — basics first; lands
WITH bulk knocking):**
1. Per-domain cooldown per owner (e.g. 30 days) — tracked in Knick's DB
2. Per-run + per-day caps on scout knocks
3. Receiver control: TYPED scout knocks are filterable by the receiving
   agent (SOP rule / auto-ignore); contract v2 may add a scout-opt-out flag
4. Economics: market.near.ai scout jobs cost $NEAR — spam gets expensive
5. Self-healing: neighbors who repeatedly ignore stop getting knocked

**Knock composer upgrade (SHIPPED 2026-08-28):**
- Input with live @mention suggestions for Goals and Deals (type @)
- Two actions: [✨ AI Assist] [Send Now]
- Send Now: sends the typed message + mentioned Goals/Deals appended as
  shared context (each truncated 600 chars, total 3500)
- AI Assist: reads the typed text as INSTRUCTIONS, pulls the mentioned
  Goal/Deal context + the receiver's registry card, recomposes for BOTH
  businesses via the app's LLM gateway (master-key local + gateway
  fallbacks — same candidates pattern as AI SOP generation)

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

## 12. Session queue (2026-08-28 EOD — carried to next session)

1. **Build Knick as a real agent → market.near.ai** (paid discovery jobs;
   hosting decision deferred; PGrust DB; go-to-source rule; enriched-DB
   flywheel = the paid value).
2. **Discovery inbox real test** — blocked until REAL neighbors exist
   (only Anakimota + Mother; the 48 fakes are *.test and can't answer).
3. **Onboarding SOP (new idea)** — when a new Neighbor registers onchain,
   the agent runs a prepared triage: "Do WE offer that service/product/info?
   If not → search the APPROVED neighbors = PUBLISHED ONCHAIN lists only"
   (extends the v1.2.211 inbound triage to registration knocks).
4. **Mainnet swap → nearneighbors.near** (funded; rehearsal account ready;
   constants flip ×4 + contract deploy ~3Ⓝ; recruit real agents to test).
5. **Telegram owner verification (new feature)** — (a) first: MB User
   Access Token (agent↔project tie); (b) later: $NEAR wallet verification
   (secure method undesigned — research). On verify: store Telegram User ID
   ↔ MB token link → owner-only capabilities/controls/KB access in the bot.
6. Parked: heartbeat multi-knock throttling, bulk scout knocks + anti-spam,
   My Network removal UI, PGrust spike, contract v2 fields, shareable cards.

## 13. Open questions

- Contract v2: filtered/paginated search views, or indexer-only? (revisit at
  ~10k neighbors)
- Knock politeness spec finalization (caps/cooldowns/identity) — see
  NEIGHBORS-FEATURES.md design flags.
- Market.near.ai billing API shape (Phase C research).
- Does My Network sync across devices via the agent's Supabase only, or also
  a future nearneighbors account? (Phase B/C)
