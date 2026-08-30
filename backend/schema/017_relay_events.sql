-- Mother Brain A2A Endpoint — Schema Migration 017
-- Relay Events (SOP Doctrine & Relays — docs/SOP-DOCTRINE-AND-RELAYS.md §5-6)
--
-- The landing path for network relays. When an agent relays a visitor's ask
-- through the Neighbors network (the "friend of a friend" doctrine), the
-- worker logs what happened here so the CRM can surface it to the owner:
--
--   kind = "ask"        → a [relay] knock was sent (audit trail, auto-logged)
--   kind = "candidates" → a relay brought back neighbor names worth
--                         considering (via the relay_report tool) — the CRM
--                         merges these into the Discovery List with a
--                         "vouched by" badge; NEVER auto-approved (v1.2.211)
--   kind = "miss"       → nothing in the network fit the visitor's need —
--                         demand signal for the owner (feeds "Missed asks"
--                         → Run Knick / Add as Goal)
--
-- NO embedding column by design: this table must never touch VoyageAI.

-- ============================================
-- 1. relay_events
-- ============================================
CREATE TABLE IF NOT EXISTS relay_events (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,                -- ask | candidates | miss
  need TEXT NOT NULL,                -- the visitor's need (one line)
  domain TEXT,                       -- candidate domain (candidates rows)
  name TEXT,                         -- candidate display name
  why TEXT,                          -- why they might fit / vouch context
  vouched_by TEXT,                   -- which neighbor's reply surfaced them
  metadata JSONB,                    -- extras (hops, trail, source)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_relay_events_kind ON relay_events(kind);
CREATE INDEX IF NOT EXISTS idx_relay_events_created ON relay_events(created_at DESC);
