-- Self-service "add bot to group" flow for the backup channel (2026-08-09),
-- mirroring notifications' tenant-facing group-link deep link pattern
-- (create_group_link_token/resolve_telegram_group_link) instead of asking
-- the Platform Admin to hand-type a numeric Telegram chat_id.
ALTER TABLE backup_settings
    ADD COLUMN telegram_bot_username TEXT,
    ADD COLUMN link_token_hash TEXT,
    ADD COLUMN link_token_expires_at TIMESTAMPTZ;
