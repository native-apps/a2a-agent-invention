-- ============================================================
-- A2A Agent Invention — COMPLETE Supabase Schema (one-shot)
-- Paste the ENTIRE file into the Supabase SQL Editor and run.
-- Idempotent: safe to re-run (all IF NOT EXISTS / CREATE OR REPLACE /
-- DROP TRIGGER IF EXISTS / DROP FUNCTION IF EXISTS).
-- ============================================================


-- ─────────────────────────────────────────────
-- FILE: 001_initial.sql
-- ─────────────────────────────────────────────
-- Mother Brain A2A Endpoint — Supabase Schema
-- Run this in the Supabase SQL editor after creating the project

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================
-- Agent Registry
-- ============================================
CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  url TEXT UNIQUE NOT NULL,
  agent_card JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- A2A Tasks
-- ============================================
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- A2A spec: task ID is assigned by the server
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN (
    'submitted',
    'working',
    'input-required',
    'completed',
    'failed',
    'canceled'
  )),
  -- The remote agent that created this task
  caller_agent_id UUID REFERENCES agents(id),
  -- Which skill is being invoked
  skill_id TEXT,
  -- Task metadata
  metadata JSONB NOT NULL DEFAULT '{}',
  -- State transition history (A2A spec feature)
  history JSONB NOT NULL DEFAULT '[]',
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- Task Messages (conversation within a task)
-- ============================================
CREATE TABLE IF NOT EXISTS task_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'agent')),
  -- Message content parts (A2A spec: multiple parts per message)
  parts JSONB NOT NULL DEFAULT '[]',
  -- Metadata
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- Task Artifacts (outputs produced by the agent)
-- ============================================
CREATE TABLE IF NOT EXISTS artifacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  -- Artifact identification
  artifact_id TEXT NOT NULL,
  name TEXT,
  description TEXT,
  -- Artifact parts (text, file, data)
  parts JSONB NOT NULL DEFAULT '[]',
  -- Metadata
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(task_id, artifact_id)
);

-- ============================================
-- Knowledge Base (for the Mother agent)
-- ============================================
CREATE TABLE IF NOT EXISTS knowledge (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Source of knowledge (product docs, pricing, support docs, etc.)
  source TEXT NOT NULL,
  -- Category for filtering
  category TEXT NOT NULL,
  -- Content
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  -- Vector embedding for semantic search
  embedding VECTOR(1536),
  -- Metadata
  tags TEXT[] DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_caller_agent ON tasks(caller_agent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_messages_task ON task_messages(task_id, created_at);
CREATE INDEX IF NOT EXISTS idx_artifacts_task ON artifacts(task_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_source ON knowledge(source);
CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge(category);
CREATE INDEX IF NOT EXISTS idx_knowledge_tags ON knowledge USING GIN(tags);

-- ============================================
-- Helper: match knowledge via cosine similarity
-- ============================================
CREATE OR REPLACE FUNCTION match_knowledge(
  query_embedding VECTOR(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5,
  filter_category TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  source TEXT,
  category TEXT,
  title TEXT,
  content TEXT,
  tags TEXT[],
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    k.id,
    k.source,
    k.category,
    k.title,
    k.content,
    k.tags,
    k.metadata,
    1 - (k.embedding <=> query_embedding) AS similarity
  FROM knowledge k
  WHERE
    (filter_category IS NULL OR k.category = filter_category)
    AND 1 - (k.embedding <=> query_embedding) > match_threshold
  ORDER BY k.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================
-- Updated_at trigger
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Idempotency: PostgreSQL's CREATE TRIGGER has no IF NOT EXISTS, so we
-- DROP IF EXISTS first to make the whole migration safe to re-run.
DROP TRIGGER IF EXISTS agents_updated_at ON agents;
CREATE TRIGGER agents_updated_at BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS tasks_updated_at ON tasks;
CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS artifacts_updated_at ON artifacts;
CREATE TRIGGER artifacts_updated_at BEFORE UPDATE ON artifacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS knowledge_updated_at ON knowledge;
CREATE TRIGGER knowledge_updated_at BEFORE UPDATE ON knowledge
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ─────────────────────────────────────────────
-- FILE: 002_visitor_sessions.sql
-- ─────────────────────────────────────────────
-- Mother Brain A2A Endpoint — Schema Migration 002
-- Persistent Visitor Sessions + Rate Limiting

-- ============================================
-- 1. Add visitor_id to tasks
-- ============================================
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS visitor_id TEXT;

-- Index for fast visitor lookups (conversation history, rate limiting)
CREATE INDEX IF NOT EXISTS idx_tasks_visitor_id ON tasks(visitor_id);

-- ============================================
-- 2. Add visitor_id to task_messages
-- ============================================
ALTER TABLE task_messages ADD COLUMN IF NOT EXISTS visitor_id TEXT;

CREATE INDEX IF NOT EXISTS idx_task_messages_visitor_id ON task_messages(visitor_id);

-- ============================================
-- 3. Rate limit tracking table
-- ============================================
CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Who is being rate limited (visitor_id or IP address)
  identifier TEXT NOT NULL,
  -- Type of identifier: 'visitor' or 'ip'
  identifier_type TEXT NOT NULL CHECK (identifier_type IN ('visitor', 'ip')),
  -- How many requests in current window
  request_count INT NOT NULL DEFAULT 1,
  -- Window start time
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- When this record expires
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 hour'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast rate limit lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_rate_limits_identifier_type
  ON rate_limits(identifier, identifier_type);

CREATE INDEX IF NOT EXISTS idx_rate_limits_expires
  ON rate_limits(expires_at);

-- ============================================
-- 4. Helper: check and increment rate limit
-- ============================================
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_identifier TEXT,
  p_identifier_type TEXT,
  p_max_requests INT DEFAULT 20,
  p_window_minutes INT DEFAULT 1
)
RETURNS TABLE (
  allowed BOOLEAN,
  remaining INT,
  reset_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INT;
  v_window_start TIMESTAMPTZ;
  v_reset_at TIMESTAMPTZ;
BEGIN
  v_window_start := NOW() - (p_window_minutes || ' minutes')::INTERVAL;
  v_reset_at := NOW() + (p_window_minutes || ' minutes')::INTERVAL;

  -- Count requests in the current window
  SELECT COALESCE(SUM(request_count), 0) INTO v_count
  FROM rate_limits
  WHERE identifier = p_identifier
    AND identifier_type = p_identifier_type
    AND window_start > v_window_start;

  -- Check if allowed
  IF v_count >= p_max_requests THEN
    RETURN QUERY SELECT false, 0, v_reset_at;
  ELSE
    -- Increment or insert
    INSERT INTO rate_limits (identifier, identifier_type, request_count, window_start, expires_at)
    VALUES (p_identifier, p_identifier_type, 1, NOW(), NOW() + INTERVAL '1 hour')
    ON CONFLICT (identifier, identifier_type)
    DO UPDATE SET
      request_count = rate_limits.request_count + 1,
      window_start = CASE
        WHEN rate_limits.window_start > v_window_start THEN rate_limits.window_start
        ELSE NOW()
      END,
      expires_at = NOW() + INTERVAL '1 hour';

    RETURN QUERY SELECT true, p_max_requests - v_count - 1, v_reset_at;
  END IF;
END;
$$;

-- ============================================
-- 5. Cleanup expired rate limit records
-- ============================================
CREATE OR REPLACE FUNCTION cleanup_expired_rate_limits()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM rate_limits WHERE expires_at < NOW();
END;
$$;


-- ─────────────────────────────────────────────
-- FILE: 003_visitor_total_recall.sql
-- ─────────────────────────────────────────────
-- Mother Brain A2A Endpoint — Schema Migration 003
-- Visitor Total Recall: Vectorized chat memory for eternal conversation recall
--
-- This gives the A2A Agent the same Total Recall capability that Mother Brain
-- uses for project chat history, but scoped per visitor. When a returning visitor
-- chats with Mother, she can recall any detail from any past conversation.

-- 1. Add embedding column to task_messages
ALTER TABLE task_messages ADD COLUMN IF NOT EXISTS embedding VECTOR(1024);

-- 2. Create HNSW index for fast cosine similarity search (better than IVFFlat for live data)
CREATE INDEX IF NOT EXISTS idx_task_messages_embedding
  ON task_messages USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 3. Index for visitor + embedding combined lookups
CREATE INDEX IF NOT EXISTS idx_task_messages_visitor_embedding
  ON task_messages (visitor_id) WHERE embedding IS NOT NULL;

-- 4. Semantic search: Find messages from a specific visitor by meaning
CREATE OR REPLACE FUNCTION match_visitor_messages(
  p_query_embedding VECTOR(1024),
  p_visitor_id TEXT,
  p_match_threshold FLOAT DEFAULT 0.3,
  p_match_count INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  task_id UUID,
  role TEXT,
  parts JSONB,
  visitor_id TEXT,
  created_at TIMESTAMPTZ,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    tm.id,
    tm.task_id,
    tm.role,
    tm.parts,
    tm.visitor_id,
    tm.created_at,
    1 - (tm.embedding <=> p_query_embedding) AS similarity
  FROM task_messages tm
  WHERE tm.visitor_id = p_visitor_id
    AND tm.embedding IS NOT NULL
    AND 1 - (tm.embedding <=> p_query_embedding) > p_match_threshold
  ORDER BY tm.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$;

-- 5. Chronological recall: Fetch last N messages for a visitor across ALL tasks
-- This is used for recent context (last conversation session).
CREATE OR REPLACE FUNCTION recall_visitor_history(
  p_visitor_id TEXT,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  task_id UUID,
  role TEXT,
  parts JSONB,
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
    tm.parts,
    tm.created_at
  FROM task_messages tm
  WHERE tm.visitor_id = p_visitor_id
  ORDER BY tm.created_at DESC
  LIMIT p_limit;
END;
$$;


-- ─────────────────────────────────────────────
-- FILE: 004_realtime.sql
-- ─────────────────────────────────────────────
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


-- ─────────────────────────────────────────────
-- FILE: 005_license_keys.sql
-- ─────────────────────────────────────────────
-- Mother Brain A2A Endpoint — Schema Migration 005
-- License Key Tracking + Conversion Linking
--
-- Adds license_key column to tasks and task_messages so in-app support
-- messages can be linked to the visitor's web chat history via the
-- Encore subscriptions API (license_key → customer → visitor_id).
--
-- The license_key is stored for REFERENCE ONLY. The primary chat identity
-- remains visitor_id (resolved from the license key via the Encore API).
-- See: https://api.motherbrain.app/subscriptions/lookup?key=XXX

-- ============================================
-- 1. Add license_key to tasks
-- ============================================
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS license_key TEXT;

-- Index for fast license-key lookups (CRM filtering, conversion tracking)
CREATE INDEX IF NOT EXISTS idx_tasks_license_key
  ON tasks(license_key) WHERE license_key IS NOT NULL;

-- ============================================
-- 2. Add license_key to task_messages
-- ============================================
ALTER TABLE task_messages ADD COLUMN IF NOT EXISTS license_key TEXT;

CREATE INDEX IF NOT EXISTS idx_task_messages_license_key
  ON task_messages(license_key) WHERE license_key IS NOT NULL;


-- ─────────────────────────────────────────────
-- FILE: 006_customer_ids.sql
-- ─────────────────────────────────────────────
-- Mother Brain A2A Endpoint — Schema Migration 006
-- Customer ID Tracking (Dual-Path Authentication)
--
-- Adds customer_id column to tasks and task_messages to link support
-- messages to a customer account. Populated from:
--
--   1. JWT session token (website) — customerId from JWT 'sub' claim
--   2. License key resolution (macOS app) — customerId from Encore API
--
-- Uses TEXT type for flexibility: holds numeric IDs, UUIDs, or email-based
-- identifiers without casting. The JWT 'sub' claim is a numeric string
-- which fits seamlessly into TEXT.
--
-- visitor_id remains the primary chat continuity anchor for anonymous users.
-- customer_id links a visitor to a customer account for collision-proof
-- chat history (logged-in users resolve by customer_id, guaranteed unique).

-- ============================================
-- 1. Add customer_id to tasks
-- ============================================
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS customer_id TEXT;

-- Index for fast customer lookups
CREATE INDEX IF NOT EXISTS idx_tasks_customer_id
  ON tasks(customer_id) WHERE customer_id IS NOT NULL;

-- ============================================
-- 2. Add customer_id to task_messages
-- ============================================
ALTER TABLE task_messages ADD COLUMN IF NOT EXISTS customer_id TEXT;

CREATE INDEX IF NOT EXISTS idx_task_messages_customer_id
  ON task_messages(customer_id) WHERE customer_id IS NOT NULL;


-- ─────────────────────────────────────────────
-- FILE: 007_cross_device_recall.sql
-- ─────────────────────────────────────────────
-- Mother Brain A2A Endpoint — Schema Migration 007
-- Cross-Device Chat: Multi-Visitor Recall
--
-- Updates the Total Recall RPC functions to accept an ARRAY of visitor_ids
-- instead of a single visitor_id. This enables cross-device chat: when a
-- user pairs multiple devices (phone, tablet, desktop), each device gets
-- its own visitor_id. All visitor_ids are linked to one customer_id.
-- These functions now query across ALL visitor_ids for the customer.
--
-- Backward compatible: passing a single-element array [vid] works identically
-- to the old single-visitor_id behavior.

-- ============================================
-- 1. Update match_visitor_messages to accept TEXT[] (array of visitor_ids)
-- ============================================
CREATE OR REPLACE FUNCTION match_visitor_messages(
  p_query_embedding VECTOR(1024),
  p_visitor_ids TEXT[],
  p_match_threshold FLOAT DEFAULT 0.3,
  p_match_count INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  task_id UUID,
  role TEXT,
  parts JSONB,
  visitor_id TEXT,
  created_at TIMESTAMPTZ,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    tm.id,
    tm.task_id,
    tm.role,
    tm.parts,
    tm.visitor_id,
    tm.created_at,
    1 - (tm.embedding <=> p_query_embedding) AS similarity
  FROM task_messages tm
  WHERE tm.visitor_id = ANY(p_visitor_ids)
    AND tm.embedding IS NOT NULL
    AND 1 - (tm.embedding <=> p_query_embedding) > p_match_threshold
  ORDER BY tm.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$;

-- ============================================
-- 2. Update recall_visitor_history to accept TEXT[] (array of visitor_ids)
-- ============================================
CREATE OR REPLACE FUNCTION recall_visitor_history(
  p_visitor_ids TEXT[],
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  task_id UUID,
  role TEXT,
  parts JSONB,
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
    tm.parts,
    tm.created_at
  FROM task_messages tm
  WHERE tm.visitor_id = ANY(p_visitor_ids)
  ORDER BY tm.created_at DESC
  LIMIT p_limit;
END;
$$;


-- ─────────────────────────────────────────────
-- FILE: 008_claim_anonymous_messages.sql
-- ─────────────────────────────────────────────
-- Mother Brain A2A Endpoint — Schema Migration 008
-- Smart Backfill: Claim Anonymous Messages
--
-- Creates an RPC function that assigns customer_id to anonymous messages
-- (where customer_id IS NULL) for a specific visitor_id. This prevents
-- cross-account contamination on shared computers:
--
--   - First purchase on a device: all NULL messages → claimed by new customer ✅
--   - Second purchase (new account) on same device: old messages already
--     have customer_id → NOT touched. Only NEW messages get new customer_id ✅
--   - Idempotent: running it again does nothing (no more NULLs to claim) ✅

-- p_customer_id is TEXT everywhere (matches tasks/task_messages/entities).
-- DROP first because CREATE OR REPLACE cannot change a parameter's type.
DROP FUNCTION IF EXISTS claim_anonymous_messages(p_visitor_id TEXT, p_customer_id TEXT);
CREATE OR REPLACE FUNCTION claim_anonymous_messages(
  p_visitor_id TEXT,
  p_customer_id TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  UPDATE task_messages
  SET customer_id = p_customer_id
  WHERE visitor_id = p_visitor_id
    AND customer_id IS NULL;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  -- Also update the tasks table
  UPDATE tasks
  SET customer_id = p_customer_id
  WHERE visitor_id = p_visitor_id
    AND customer_id IS NULL;

  RETURN v_updated_count;
END;
$$;


-- ─────────────────────────────────────────────
-- FILE: 009_entities_tags_status.sql
-- ─────────────────────────────────────────────
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
  customer_id TEXT,
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
-- Customer ID is TEXT everywhere (tasks, task_messages, entities) — the
-- Worker treats it as a string (JWT sub, license customerId, or generic
-- user_id like "user-123"). CREATE OR REPLACE cannot change a parameter's
-- type, so we DROP the function first to make this migration re-runnable.
DROP FUNCTION IF EXISTS upsert_entity(p_visitor_id TEXT, p_customer_id TEXT, p_entity_name TEXT, p_entity_type TEXT, p_source TEXT, p_agent_card JSONB);
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


-- ─────────────────────────────────────────────
-- FILE: 010_backfill_message_tags.sql
-- ─────────────────────────────────────────────
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


-- ─────────────────────────────────────────────
-- FILE: 011_telegram_links.sql
-- ─────────────────────────────────────────────
-- Telegram Integration — Link Telegram chat_id to customer account
-- Schema 011
--
-- When a Telegram user pairs their account (via QR code / website link),
-- their Telegram chat_id is linked to their customer_id + visitor_id.
-- This enables cross-platform conversation continuity.
--
-- Before pairing: Telegram messages use visitor_id = 'telegram:<chat_id>'
-- After pairing:  Telegram messages use the linked visitor_id + customer_id

CREATE TABLE IF NOT EXISTS telegram_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Telegram identifiers
  telegram_chat_id BIGINT NOT NULL UNIQUE,
  telegram_username TEXT,
  telegram_first_name TEXT,
  -- Linked Mother Brain identifiers (populated after pairing)
  customer_id INTEGER,
  visitor_id TEXT,
  -- Pairing state
  paired BOOLEAN NOT NULL DEFAULT FALSE,
  paired_at TIMESTAMPTZ,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telegram_links_chat_id ON telegram_links(telegram_chat_id);
CREATE INDEX IF NOT EXISTS idx_telegram_links_customer ON telegram_links(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_telegram_links_paired ON telegram_links(paired) WHERE paired = TRUE;

-- Idempotency: PostgreSQL's CREATE TRIGGER has no IF NOT EXISTS, so we
-- DROP IF EXISTS first to make this migration safe to re-run.
DROP TRIGGER IF EXISTS telegram_links_updated_at ON telegram_links;
CREATE TRIGGER telegram_links_updated_at BEFORE UPDATE ON telegram_links
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ─────────────────────────────────────────────
-- FILE: 012_task_messages_customer_id.sql
-- ─────────────────────────────────────────────
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


-- ─────────────────────────────────────────────
-- FILE: 013_backfill_customer_id.sql
-- ─────────────────────────────────────────────
-- Mother Brain A2A Endpoint — Schema Migration 013
-- Backfill customer_id on existing tasks from task_messages
--
-- Tasks created before migration 006 don't have customer_id set on the
-- task row, even though their messages may have customer_id from the
-- JWT/license resolution that ran at message-send time.
--
-- This backfills customer_id onto the task from its most recent
-- authenticated message, so future lookups by customer_id find it.
--
-- ⚠️  REVIEW BEFORE RUNNING: Uncomment the UPDATE statement after
--     verifying the SELECT output.

-- ============================================
-- STEP 1: REVIEW — Which tasks need backfilling?
-- ============================================
SELECT
  t.id AS task_id,
  t.visitor_id,
  t.customer_id AS task_customer_id,
  latest_msg.customer_id AS message_customer_id,
  t.created_at,
  (SELECT COUNT(*) FROM task_messages WHERE task_id = t.id) AS message_count
FROM tasks t
JOIN LATERAL (
  SELECT customer_id
  FROM task_messages tm
  WHERE tm.task_id = t.id
    AND tm.customer_id IS NOT NULL
  ORDER BY tm.created_at DESC
  LIMIT 1
) AS latest_msg ON true
WHERE t.customer_id IS NULL
ORDER BY t.created_at DESC;

-- ============================================
-- STEP 2: BACKFILL — Set customer_id on tasks from their messages
-- ============================================
-- Uncomment and run AFTER reviewing the SELECT output above.
--
-- UPDATE tasks t
-- SET customer_id = sub.customer_id
-- FROM (
--   SELECT DISTINCT ON (task_id)
--     task_id,
--     customer_id
--   FROM task_messages
--   WHERE customer_id IS NOT NULL
--   ORDER BY task_id, created_at DESC
-- ) AS sub
-- WHERE t.id = sub.task_id
--   AND t.customer_id IS NULL;

-- ============================================
-- STEP 3: VERIFY — Confirm tasks now have customer_id
-- ============================================
-- SELECT
--   customer_id,
--   COUNT(*) AS task_count
-- FROM tasks
-- WHERE customer_id IS NOT NULL
-- GROUP BY customer_id
-- ORDER BY task_count DESC;


-- ─────────────────────────────────────────────
-- FILE: 014_entities_customer_id_text.sql
-- ─────────────────────────────────────────────
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

