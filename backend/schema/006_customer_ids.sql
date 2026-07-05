-- Mother Brain A2A Endpoint — Schema Migration 006
-- Customer ID Tracking (Dual-Path Authentication)
--
-- Adds customer_id column to tasks and task_messages to link support
-- messages to a customer account. Populated from two sources:
--
--   1. JWT session token (website) — customerId from JWT 'sub' claim
--   2. License key resolution (macOS app) — customerId from Encore API
--
-- The customer_id is the Stripe/Encore DB customers.id (integer).
-- visitor_id remains the primary chat continuity anchor (Broprint.js).
-- customer_id links a visitor to a customer account for priority routing,
-- subscription status lookup, and CRM account views.

-- ============================================
-- 1. Add customer_id to tasks
-- ============================================
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS customer_id INTEGER;

-- Index for fast customer lookups (CRM account views, priority routing)
CREATE INDEX IF NOT EXISTS idx_tasks_customer_id
  ON tasks(customer_id) WHERE customer_id IS NOT NULL;

-- ============================================
-- 2. Add customer_id to task_messages
-- ============================================
ALTER TABLE task_messages ADD COLUMN IF NOT EXISTS customer_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_task_messages_customer_id
  ON task_messages(customer_id) WHERE customer_id IS NOT NULL;
