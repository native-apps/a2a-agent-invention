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
