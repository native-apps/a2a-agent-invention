-- Deals — durable partnership records for the NEAR Neighbors B2B network.
-- Single source of truth: the agent's own Supabase DB. The owner (console)
-- and the agent (runtime) read/write the SAME rows by id — no deployed
-- copies, no stale duplicates. Approved deals are injected live into the
-- agent's system prompt as ACTIVE PARTNERSHIPS (no redeploy needed).
CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY,             -- app-generated (crypto.randomUUID), stable app↔worker
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',   -- markdown
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','proposed','approved','done','archived')),
  source TEXT NOT NULL DEFAULT 'owner' CHECK (source IN ('owner','agent')),
  neighbor_domain TEXT,            -- optional partner domain (agent-written deals set this)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deals_status ON deals(status);
