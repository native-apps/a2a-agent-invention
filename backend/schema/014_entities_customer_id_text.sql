-- Mother Brain A2A Endpoint — Schema Migration 014
-- entities.customer_id INTEGER → TEXT
--
-- The Worker treats customer_id as a string everywhere (JWT sub, license
-- customerId, generic user_id like "user-123"). tasks.customer_id and
-- task_messages.customer_id are TEXT (migrations 006/012), but the entities
-- table (migration 009) created customer_id as INTEGER. That mismatch broke
-- the migration-010 backfill (MAX(tm.customer_id) text → integer column).
--
-- This converts entities.customer_id to TEXT so all three tables agree.
-- Numeric values keep their value; non-numeric strings stay strings.

-- 1. Convert the column (integer → text preserves digits; existing NULLs stay NULL)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'entities'
    AND column_name = 'customer_id'
    AND data_type = 'integer'
  ) THEN
    ALTER TABLE entities ALTER COLUMN customer_id TYPE TEXT;
  END IF;
END $$;

-- 2. Make the upsert_entity RPC use TEXT (DROP first — CREATE OR REPLACE
--    cannot change a parameter's type).
DROP FUNCTION IF EXISTS upsert_entity(p_visitor_id TEXT, p_customer_id INTEGER, p_entity_name TEXT, p_entity_type TEXT, p_source TEXT, p_agent_card JSONB);
CREATE OR REPLACE FUNCTION upsert_entity(
  p_visitor_id TEXT,
  p_customer_id TEXT DEFAULT NULL,
  p_entity_name TEXT DEFAULT NULL,
  p_entity_type TEXT DEFAULT NULL,
  p_source TEXT DEFAULT NULL,
  p_agent_card JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO entities (visitor_id, customer_id, entity_name, entity_type, source, agent_card, first_seen, last_active, message_count)
  VALUES (
    p_visitor_id,
    p_customer_id,
    p_entity_name,
    COALESCE(p_entity_type, 'visitor'),
    COALESCE(p_source, 'website'),
    p_agent_card,
    NOW(),
    NOW(),
    1
  )
  ON CONFLICT (visitor_id) DO UPDATE SET
    customer_id = COALESCE(EXCLUDED.customer_id, entities.customer_id),
    entity_name = COALESCE(EXCLUDED.entity_name, entities.entity_name),
    entity_type = COALESCE(EXCLUDED.entity_type, entities.entity_type),
    source = COALESCE(EXCLUDED.source, entities.source),
    agent_card = COALESCE(EXCLUDED.agent_card, entities.agent_card),
    last_active = NOW(),
    message_count = entities.message_count + 1,
    updated_at = NOW();
END;
$$;
