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
