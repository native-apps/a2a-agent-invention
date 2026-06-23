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
