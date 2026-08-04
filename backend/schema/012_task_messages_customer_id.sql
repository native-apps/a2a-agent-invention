-- Mother Brain A2A Endpoint — Schema Migration 012
-- task_messages.customer_id (formal column)
--
-- The code inserts customer_id into task_messages, but migration 006
-- only added it to tasks. This ensures task_messages has the column too.
-- If already added by 006, this is a no-op (IF NOT EXISTS).
--`
-- Also handles migration from INTEGER to TEXT if the column was created
-- by an older version of 006 that used INTEGER type.

-- Ensure task_messages has customer_id TEXT
ALTER TABLE task_messages ADD COLUMN IF NOT EXISTS customer_id TEXT;

-- If the column exists but is INTEGER, alter to TEXT
-- (PostgreSQL can cast integer → text implicitly on ALTER)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_messages'
    AND column_name = 'customer_id'
    AND data_type = 'integer'
  ) THEN
    ALTER TABLE task_messages ALTER COLUMN customer_id TYPE TEXT;
  END IF;
END $$;

-- Index for customer-based lookups (cross-browser history resolution)
CREATE INDEX IF NOT EXISTS idx_task_messages_customer_id
  ON task_messages(customer_id) WHERE customer_id IS NOT NULL;
