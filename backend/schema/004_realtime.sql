-- Mother Brain A2A Endpoint — Schema Migration 004
-- Supabase Realtime: Enable live message updates for the Chat UI
--
-- This enables the Chat UI to receive new messages in real-time without polling.
-- The Supabase client subscribes to INSERT events on task_messages and task status changes.
--
-- NOTE: Supabase Free tier supports 200 concurrent Realtime connections.
-- For production with many visitors, upgrade to a paid plan.
--
-- IMPORTANT: On Supabase Cloud, Realtime is built-in — no extension needed.
-- Only the PUBLICATION needs to be configured.

-- 1. Add visitor_id to tasks table (for filtering Realtime events per visitor)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'visitor_id'
  ) THEN
    ALTER TABLE tasks ADD COLUMN visitor_id TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tasks_visitor_id ON tasks(visitor_id);

-- 2. Enable RLS (Row Level Security) for Realtime safety
ALTER TABLE task_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- 3. RLS policy: Allow reading messages (needed for Realtime subscriptions)
CREATE POLICY "Allow reading task_messages" ON task_messages
  FOR SELECT USING (true);

CREATE POLICY "Allow reading tasks" ON tasks
  FOR SELECT USING (true);

-- 4. Add tables to the Realtime publication
-- On Supabase Cloud, the supabase_realtime publication already exists.
-- We just need to add our tables to it.
ALTER PUBLICATION supabase_realtime ADD TABLE task_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
