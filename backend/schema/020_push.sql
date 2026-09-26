-- Owner push notifications (v1.2.354) — the agent is the transmitter
-- (NNN handoff: AGENT-PUSH-HANDOFF.md). Zero-config: the worker lazily
-- generates its VAPID keypair on first pair and stores it here.
CREATE TABLE IF NOT EXISTS push_config (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),  -- single row (id = true)
  vapid_public_key TEXT NOT NULL,   -- base64url uncompressed P-256 point (65B)
  vapid_private_jwk TEXT NOT NULL,  -- P-256 private JWK (agent's own DB — private to the owner)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Paired owner devices — MULTI-DEVICE (endpoint-keyed; phone + tablet both
-- ring). Pruned automatically when a push service answers 404/410.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,        -- push service URL (unique per device+browser)
  p256dh TEXT NOT NULL,             -- client public key (base64)
  auth TEXT NOT NULL,               -- auth secret (base64)
  account TEXT NOT NULL DEFAULT '', -- paired NEAR account (== owner/curator)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_push_at TIMESTAMPTZ
);
