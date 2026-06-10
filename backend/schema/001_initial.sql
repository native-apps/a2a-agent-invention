-- Mother Brain A2A Endpoint — Supabase Schema
-- Run this in the Supabase SQL editor after creating the project

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================
-- Agent Registry
-- ============================================
CREATE TABLE agents (
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
CREATE TABLE tasks (
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
CREATE TABLE task_messages (
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
CREATE TABLE artifacts (
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
CREATE TABLE knowledge (
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
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_caller_agent ON tasks(caller_agent_id);
CREATE INDEX idx_tasks_created_at ON tasks(created_at DESC);
CREATE INDEX idx_task_messages_task ON task_messages(task_id, created_at);
CREATE INDEX idx_artifacts_task ON artifacts(task_id);
CREATE INDEX idx_knowledge_source ON knowledge(source);
CREATE INDEX idx_knowledge_category ON knowledge(category);
CREATE INDEX idx_knowledge_tags ON knowledge USING GIN(tags);

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

CREATE TRIGGER agents_updated_at BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER artifacts_updated_at BEFORE UPDATE ON artifacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER knowledge_updated_at BEFORE UPDATE ON knowledge
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
