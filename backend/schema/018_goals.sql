-- Goals (v1.2.341) — live business goals, mirroring the deals pattern.
-- Single source of truth: the agent's own Supabase DB. The console writes
-- rows; the worker reads them LIVE (short cache) for the system-prompt
-- goals block AND the scheduled heartbeat — no redeploy needed to change
-- goals, no 5.1 kB secret limit (the AGENT_GOALS_JSON secret is retired).
-- Migration: on first read, workers seed this table from their deployed
-- AGENT_GOALS_JSON when the table is empty (one-time).
CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,             -- app-generated (crypto.randomUUID), stable app↔worker
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',   -- markdown
  enabled BOOLEAN NOT NULL DEFAULT TRUE,  -- heartbeat + prompt pick ENABLED goals only
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goals_enabled ON goals(enabled);
