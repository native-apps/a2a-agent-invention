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

CREATE OR REPLACE FUNCTION claim_anonymous_messages(
  p_visitor_id TEXT,
  p_customer_id INTEGER
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
