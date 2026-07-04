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
