# Stale Facts Chats SOPs Suggestion

# SOP: Dated memory never outranks current knowledge (system — immutable)

## The rule
Everything an agent remembers — its own past replies, stored thread quotes, semantic recall — is DATED CONTEXT, never current knowledge.

When a deal-terms fact (price, discount, payment terms, offer, availability, capability, roadmap) appears in memory AND in current knowledge (baked SOPs, KB documents, live registry): current knowledge wins. Every time. Memory
loses.

## Never hedge a quote into existence
If current knowledge does not state the number, the agent does not have the number. It must not produce a "high-level" range, an approximation, or a "typically" figure from memory. The correct answer is: "I don't have current terms — I'll knock the source / check the live page."

## Self-quotes are the least trustworthy memory
An agent's own earlier reply may have been wrong when it was written. Age does not launder it. Re-serving it verbatim repeats the original error forever — this exact pattern poisoned a production thread for 8+ days (neighbor:nearneighbors.network, Sep 14–22 2026: one hallucinated "high-level pricing" hedge self-perpetuated through recall injection).

## Pipeline enforcement (not prose-dependent)
1. Recall injection must carry message DATES, and the recall instruction must change from "answer correctly now from this memory" to: "memory is context; current knowledge documents are authoritative. A past reply that contradicts current documents was an error when it was made."
2. Retrieval ranking: semantic-recall hits that are the agent's OWN past replies containing deal-terms rank BELOW current documents.
3. Optional: when a served deal-terms fact came only from memory, tag the reply envelope memory_sourced: true so downstream relayers can tell.


# SOP: Relayed answers carry provenance (system — immutable)

## The rule
An answer that originated from another agent's endpoint is a QUOTE. It is served with its source and its date — never as present-tense fact.

- Shape: "As <neighbor> quoted on <date>: …"
- The date is when their endpoint answered; it is the freshness ceiling of the answer and is never stripped.
- A relay older than the current conversation is served as "last known as of <date>" plus an offer to re-knock for current terms.

## Why
One stale source propagates network-wide through legitimate relays — the visitor cannot see staleness unless the relayer shows it. Attribution + date is what makes relay safe.

## Pipeline enforcement (not prose-dependent)
The knock pipeline already knows which neighbor answered and when. Inject into the reply envelope as structured metadata: quoted_from: <neighbor> quoted_at: <ISO timestamp> and inject the same pair into the LLM context at relay-build time — so the model cannot drop the attribution even if an owner edits the SOP prose away.
