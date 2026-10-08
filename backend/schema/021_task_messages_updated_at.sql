-- 021: task_messages updated_at auto-trigger (sync watermark bulletproofing)
--
-- Context (2026-10-06, Supabase egress quota incident on Anakimota A2A):
-- the embedded-pg sync engine is being upgraded to incremental (watermark)
-- sync keyed on updated_at. All four synced tables already carry
-- updated_at; agents/tasks/artifacts already have auto-update triggers
-- (001_initial.sql). task_messages is append-only in practice (no UPDATE
-- paths exist in backend/src), so DEFAULT NOW() sufficed — but if console
-- or CRM code ever UPDATEs a message row (read flags, edits), the watermark
-- would silently miss it. This trigger closes that gap. Idempotent.

DROP TRIGGER IF EXISTS task_messages_updated_at ON task_messages;

CREATE TRIGGER task_messages_updated_at BEFORE UPDATE ON task_messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
