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
