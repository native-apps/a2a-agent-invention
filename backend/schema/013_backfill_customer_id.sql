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
