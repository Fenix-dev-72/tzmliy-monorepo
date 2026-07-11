-- name: insert_user^
-- Conflict target is now (email) alone -- email is globally unique across
-- tenants (0020_self_registration.sql), not just per-tenant. Callers must
-- pre-check phone uniqueness themselves (via get_login_identifier) before
-- calling this, since ON CONFLICT can only target one constraint and the
-- partial unique index on phone would otherwise surface as a raw
-- asyncpg.UniqueViolationError instead of a clean None.
INSERT INTO users (tenant_id, email, phone, password_hash, role_id)
VALUES (:tenant_id, :email, :phone, :password_hash, :role_id)
ON CONFLICT (email) DO NOTHING
RETURNING id, tenant_id, email, phone, role_id,
    (SELECT name FROM roles WHERE id = role_id) AS role_name,
    is_active, totp_enabled, created_at;

-- name: insert_login_identifier^
-- Kept in sync with `users` by the caller, in the same transaction as
-- insert_user -- see auth/repository.py's insert_user_with_identifiers.
INSERT INTO user_login_identifiers (identifier, identifier_type, tenant_id, user_id)
VALUES (:identifier, :identifier_type, :tenant_id, :user_id)
ON CONFLICT (identifier) DO NOTHING
RETURNING identifier;

-- name: get_login_identifier^
-- Platform-level lookup (no RLS on user_login_identifiers) -- the only way
-- to resolve which tenant an email/phone belongs to before a tenant-scoped
-- connection can be opened. Must be queried via platform_connection().
SELECT identifier, identifier_type, tenant_id, user_id
FROM user_login_identifiers
WHERE identifier = :identifier;

-- name: get_user_by_email^
SELECT u.id, u.tenant_id, u.email, u.phone, u.password_hash, u.role_id, r.name AS role_name,
       u.is_active, u.totp_secret, u.totp_enabled, u.failed_login_attempts, u.locked_until, u.created_at
FROM users u JOIN roles r ON r.id = u.role_id
WHERE u.tenant_id = :tenant_id AND u.email = :email;

-- name: get_user_by_phone^
SELECT u.id, u.tenant_id, u.email, u.phone, u.password_hash, u.role_id, r.name AS role_name,
       u.is_active, u.totp_secret, u.totp_enabled, u.failed_login_attempts, u.locked_until, u.created_at
FROM users u JOIN roles r ON r.id = u.role_id
WHERE u.tenant_id = :tenant_id AND u.phone = :phone;

-- name: get_user_by_id^
SELECT u.id, u.tenant_id, u.email, u.phone, u.password_hash, u.role_id, r.name AS role_name,
       u.is_active, u.totp_secret, u.totp_enabled, u.failed_login_attempts, u.locked_until, u.created_at
FROM users u JOIN roles r ON r.id = u.role_id
WHERE u.id = :user_id;

-- name: record_failed_login^
-- Atomic increment-and-maybe-lock: crossing the threshold sets locked_until
-- in the same statement, so two concurrent failures can't race past it.
UPDATE users
SET failed_login_attempts = failed_login_attempts + 1,
    locked_until = CASE
        WHEN failed_login_attempts + 1 >= :max_attempts
        THEN now() + make_interval(mins => :lockout_minutes)
        ELSE locked_until
    END,
    updated_at = now()
WHERE id = :user_id
RETURNING failed_login_attempts, locked_until;

-- name: reset_failed_logins!
UPDATE users
SET failed_login_attempts = 0, locked_until = NULL, updated_at = now()
WHERE id = :user_id AND (failed_login_attempts > 0 OR locked_until IS NOT NULL);

-- name: list_users
SELECT u.id, u.tenant_id, u.email, u.phone, u.role_id, r.name AS role_name, u.is_active, u.created_at
FROM users u JOIN roles r ON r.id = u.role_id
ORDER BY u.created_at;

-- name: update_user_role!
UPDATE users SET role_id = :role_id, updated_at = now() WHERE id = :user_id;

-- name: deactivate_user!
UPDATE users SET is_active = false, updated_at = now() WHERE id = :user_id;

-- name: update_user_password!
UPDATE users SET password_hash = :password_hash, updated_at = now() WHERE id = :user_id;

-- name: set_user_totp_secret!
UPDATE users SET totp_secret = :totp_secret, totp_enabled = false WHERE id = :user_id;

-- name: enable_user_totp!
UPDATE users SET totp_enabled = true WHERE id = :user_id;

-- name: insert_refresh_session^
INSERT INTO refresh_sessions (id, tenant_id, user_id, token_hash, expires_at)
VALUES (:id, :tenant_id, :user_id, :token_hash, :expires_at)
RETURNING id;

-- name: get_active_refresh_session^
SELECT id, tenant_id, user_id, token_hash, expires_at
FROM refresh_sessions
WHERE id = :session_id AND user_id = :user_id
  AND revoked_at IS NULL AND expires_at > now();

-- name: revoke_refresh_session!
UPDATE refresh_sessions SET revoked_at = now() WHERE id = :session_id;

-- name: revoke_all_user_refresh_sessions!
UPDATE refresh_sessions SET revoked_at = now() WHERE user_id = :user_id AND revoked_at IS NULL;

-- password_reset_tokens / otp_codes / registration_verifications queries
-- removed -- that data lives in Redis now (see app/modules/auth/otp_store.py).
