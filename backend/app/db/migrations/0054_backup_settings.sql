-- Platform-level (no tenant_id, no RLS -- same shape as billing_plans/
-- platform_admins) config for the daily DB backup-to-Telegram job. Singleton
-- table: `id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1)` is the standard
-- Postgres trick for "exactly one row, ever" -- service.py upserts against
-- id=1 rather than juggling a real primary key. Bot token is stored
-- encrypted (app/core/crypto.py's Fernet wrapper, same as tenant Telegram
-- bot tokens) since it's a live credential capable of posting to the backup
-- channel.
CREATE TABLE backup_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    telegram_bot_token_encrypted TEXT,
    telegram_chat_id BIGINT,
    last_backup_at TIMESTAMPTZ,
    last_backup_status TEXT CHECK (last_backup_status IN ('success', 'failed')),
    last_backup_error TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
