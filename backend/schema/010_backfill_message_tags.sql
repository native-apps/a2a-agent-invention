-- Mother Brain A2A Endpoint — Schema Migration 010
-- Entity Backfill + Message Tags
--
-- 1. Adds tags column to task_messages for per-message tagging
-- 2. Backfills the entities table from existing tasks/task_messages
--    (so all past conversations appear in the Entities screen)

-- ============================================
-- 1. Add tags to task_messages
-- ============================================
ALTER TABLE task_messages ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_task_messages_tags
  ON task_messages USING gin(tags) WHERE tags <> '{}';

-- ============================================
-- 2. Backfill entities from existing data
-- ============================================
-- For each unique visitor_id in task_messages, create or update an entity
-- with aggregated stats (message count, first/last seen, type, source).

INSERT INTO entities (visitor_id, customer_id, entity_name, entity_type, source, first_seen, last_active, message_count, tags, status)
SELECT
  tm.visitor_id,
  MAX(tm.customer_id),
  NULL, -- entity_name: AI will populate later
  CASE
    WHEN MAX(tm.customer_id) IS NOT NULL THEN 'customer'
    ELSE 'visitor'
  END,
  CASE
    WHEN MAX(tm.license_key) IS NOT NULL THEN 'in-app'
    ELSE 'website'
  END,
  MIN(tm.created_at),
  MAX(tm.created_at),
  COUNT(*),
  '{}',
  'open'
FROM task_messages tm
WHERE tm.visitor_id IS NOT NULL
GROUP BY tm.visitor_id
ON CONFLICT (visitor_id) DO UPDATE SET
  customer_id = COALESCE(EXCLUDED.customer_id, entities.customer_id),
  entity_type = COALESCE(EXCLUDED.entity_type, entities.entity_type),
  source = COALESCE(EXCLUDED.source, entities.source),
  first_seen = LEAST(EXCLUDED.first_seen, entities.first_seen),
  last_active = GREATEST(EXCLUDED.last_active, entities.last_active),
  message_count = GREATEST(EXCLUDED.message_count, entities.message_count),
  updated_at = NOW();

-- ============================================
-- 3. RPC: Update message tags
-- ============================================
CREATE OR REPLACE FUNCTION update_message_tags(
  p_message_id UUID,
  p_tags TEXT[]
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE task_messages SET tags = p_tags WHERE id = p_message_id;
END;
$$;

-- ============================================
-- 4. RPC: Get messages with tags for an entity
-- ============================================
CREATE OR REPLACE FUNCTION get_tagged_messages(
  p_visitor_id TEXT
)
RETURNS TABLE (
  id UUID,
  task_id UUID,
  role TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    tm.id,
    tm.task_id,
    tm.role,
    tm.tags,
    tm.created_at
  FROM task_messages tm
  WHERE tm.visitor_id = p_visitor_id
    AND tm.tags <> '{}'
  ORDER BY tm.created_at DESC;
END;
$$;
