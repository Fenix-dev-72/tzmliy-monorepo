-- One-click OAuth connect for AmoCRM/Bitrix24/Meta Ads (2026-07-15).
-- Nullable -- today's manually-pasted long-lived tokens (webhook-mode
-- Bitrix24, static Meta token) leave these NULL and keep working unchanged;
-- only OAuth-connected credentials populate them.
ALTER TABLE integration_credentials ADD COLUMN refresh_token_encrypted TEXT;
ALTER TABLE integration_credentials ADD COLUMN token_expires_at TIMESTAMPTZ;
