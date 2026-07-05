-- Mother Brain A2A Endpoint — Schema Migration 009
-- Entities + Tags + Status + AI Bot Detection
--
-- Adds entity tracking columns to the tasks table and creates a new
-- entities table that aggregates visitor/customer/AI bot data across
-- all conversations. This powers the Entities screen and support
-- ticket management in the CRM view.

-- ============================================
-- 1. Add entity columns to tasks
-- ============================================
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS entity_name TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS entity_type TEXT DEFAULT 'visitor';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'website';

CREATE INDEX IF NOT EXISTS idx_tasks_tags ON tasks USING gin(tags) WHERE tags <> '{}';
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status) WHERE status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_entity_type ON tasks(entity_type) WHERE entity_type IS NOT NULL;

-- ============================================
-- 2. Add entity_name to task_messages (for AI name extraction)
-- ============================================
ALTER TABLE task_messages ADD COLUMN IF NOT EXISTS entity_name TEXT;

-- ============================================
-- 3. Create entities table
-- ============================================
CREATE TABLE IF NOT EXISTS entities (
  visitor_id TEXT PRIMARY KEY,
  customer_id INTEGER,
  entity_name TEXT,
  entity_type TEXT DEFAULT 'visitor',
  source TEXT DEFAULT 'website',
  agent_card JSONB,
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_active TIMESTAMPTZ DEFAULT NOW(),
  message_count INTEGER DEFAULT 0,
  tags TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entities_customer_id ON entities(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_entities_entity_type ON entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_source ON entities(source);
CREATE INDEX IF NOT EXISTS idx_entities_status ON entities(status);
CREATE INDEX IF NOT EXISTS idx_entities_tags ON entities USING gin(tags) WHERE tags <> '{}';
CREATE INDEX IF NOT EXISTS idx_entities_last_active ON entities(last_active);
CREATE INDEX IF NOT EXISTS idx_entities_entity_name ON entities(entity_name) WHERE entity_name IS NOT NULL;

-- ============================================
-- 4. Upsert entity RPC (called on every message/send)
-- ============================================
-- Updates last_active, message_count, and optionally name/type/source/agent_card.
-- Creates the entity row if it doesn't exist yet.
CREATE OR REPLACE FUNCTION upsert_entity(
  p_visitor_id TEXT,
  p_customer_id INTEGER DEFAULT NULL,
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

-- ============================================
-- 5. Update entity tags RPC
-- ============================================
CREATE OR REPLACE FUNCTION update_entity_tags(
  p_visitor_id TEXT,
  p_tags TEXT[]
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE entities SET tags = p_tags, updated_at = NOW()
  WHERE visitor_id = p_visitor_id;
END;
$$;

-- ============================================
-- 6. Update entity status RPC
-- ============================================
CREATE OR REPLACE FUNCTION update_entity_status(
  p_visitor_id TEXT,
  p_status TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE entities SET status = p_status, updated_at = NOW()
  WHERE visitor_id = p_visitor_id;
END;
$$;

-- ============================================
-- 7. Update entity name RPC (AI-populated)
-- ============================================
CREATE OR REPLACE FUNCTION update_entity_name(
  p_visitor_id TEXT,
  p_name TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE entities SET entity_name = p_name, updated_at = NOW()
  WHERE visitor_id = p_visitor_id AND (entity_name IS NULL OR entity_name = '');
END;
$$;
