-- name: get_backup_settings^
SELECT id, telegram_bot_token_encrypted, telegram_bot_username, telegram_chat_id,
       link_token_hash, link_token_expires_at,
       last_backup_at, last_backup_status, last_backup_error, updated_at
FROM backup_settings
WHERE id = 1;

-- name: upsert_bot_token^
-- Saves/replaces the bot credential -- deliberately does NOT touch
-- telegram_chat_id (re-configuring the bot shouldn't silently disconnect an
-- already-linked group) and clears any stale pending link token (a token
-- generated for the previous bot would never resolve against the new one).
INSERT INTO backup_settings (id, telegram_bot_token_encrypted, telegram_bot_username, updated_at)
VALUES (1, :bot_token_encrypted, :bot_username, now())
ON CONFLICT (id) DO UPDATE SET
    telegram_bot_token_encrypted = EXCLUDED.telegram_bot_token_encrypted,
    telegram_bot_username = EXCLUDED.telegram_bot_username,
    link_token_hash = NULL,
    link_token_expires_at = NULL,
    updated_at = now()
RETURNING id, telegram_bot_token_encrypted, telegram_bot_username, telegram_chat_id,
          link_token_hash, link_token_expires_at,
          last_backup_at, last_backup_status, last_backup_error, updated_at;

-- name: set_link_token!
UPDATE backup_settings
SET link_token_hash = :token_hash, link_token_expires_at = :expires_at, updated_at = now()
WHERE id = 1;

-- name: resolve_link_token^
-- Atomically consumes the pending link token (clears it in the same
-- statement) and sets the discovered chat_id -- only if the token hash
-- matches and hasn't expired. Returns the updated row, or no row if the
-- token was stale/already used (mirrors resolve_telegram_group_link's
-- no-op-on-stale-token contract).
UPDATE backup_settings
SET telegram_chat_id = :chat_id, link_token_hash = NULL, link_token_expires_at = NULL, updated_at = now()
WHERE id = 1 AND link_token_hash = :token_hash AND link_token_expires_at > now()
RETURNING id;

-- name: record_backup_result!
INSERT INTO backup_settings (id, last_backup_at, last_backup_status, last_backup_error, updated_at)
VALUES (1, now(), :status, :error, now())
ON CONFLICT (id) DO UPDATE SET
    last_backup_at = now(),
    last_backup_status = EXCLUDED.last_backup_status,
    last_backup_error = EXCLUDED.last_backup_error,
    updated_at = now();
