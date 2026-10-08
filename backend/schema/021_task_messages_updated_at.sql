-- 021: task_messages updated_at column + auto-trigger (sync watermark)
--
-- Context (2026-10-06 Supabase egress quota incident; root cause refined
-- 2026-10-08 via Knick API logs): the embedded-pg sync engine and the CRM
-- conversation-list cache key incremental sync on task_messages.updated_at
-- — but task_messages is the ONE synced table whose base schema (001) never
-- had an updated_at column (agents/tasks/artifacts all do). Without it,
-- every watermark query 400s and both consumers fall back to full pulls.
--
-- ADD COLUMN IF NOT EXISTS is idempotent and safe on every project state:
-- fresh provisions and already-migrated ones alike. Existing rows are
-- backfilled with the ALTER-time NOW() (uniform baseline — a correct
-- starting cursor for watermark purposes).
--
-- The trigger bulletproofs the watermark: task_messages is append-only in
-- practice (no UPDATE paths in backend/src), so DEFAULT NOW() covers
-- inserts, and the trigger guarantees any future UPDATE (read flags,
-- edits) advances updated_at instead of silently missing the cursor.
-- Self-contained by design: (re)defines its own trigger function so it
-- cannot depend on which historical version of 001 a project ran.

ALTER TABLE task_messages
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS task_messages_updated_at ON task_messages;

CREATE TRIGGER task_messages_updated_at BEFORE UPDATE ON task_messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
