-- name: get_platform_admin_by_email^
SELECT id, email, password_hash, is_active, totp_secret, totp_enabled, failed_login_attempts, locked_until
FROM platform_admins
WHERE email = :email;

-- name: get_platform_admin_by_id^
SELECT id, email, password_hash, is_active, totp_secret, totp_enabled, failed_login_attempts, locked_until
FROM platform_admins
WHERE id = :admin_id;

-- name: record_platform_admin_failed_login^
UPDATE platform_admins
SET failed_login_attempts = failed_login_attempts + 1,
    locked_until = CASE
        WHEN failed_login_attempts + 1 >= :max_attempts
        THEN now() + make_interval(mins => :lockout_minutes)
        ELSE locked_until
    END
WHERE id = :admin_id
RETURNING failed_login_attempts, locked_until;

-- name: reset_platform_admin_failed_logins!
UPDATE platform_admins
SET failed_login_attempts = 0, locked_until = NULL
WHERE id = :admin_id AND (failed_login_attempts > 0 OR locked_until IS NOT NULL);

-- name: set_platform_admin_totp_secret!
UPDATE platform_admins SET totp_secret = :totp_secret, totp_enabled = false WHERE id = :admin_id;

-- name: enable_platform_admin_totp!
UPDATE platform_admins SET totp_enabled = true WHERE id = :admin_id;

-- name: insert_tenant^
-- trial_ends_at uses its column DEFAULT (now() + 15 days, see
-- 0020_self_registration.sql) -- not set explicitly here, so both the
-- self-registration and Platform-Admin-provisioning paths get the same
-- default trial window.
INSERT INTO tenants (name, slug)
VALUES (:name, :slug)
ON CONFLICT (slug) DO NOTHING
RETURNING id, name, slug, status, trial_ends_at, created_at;

-- name: list_tenants
SELECT id, name, slug, status, trial_ends_at, created_at
FROM tenants
ORDER BY created_at DESC;

-- name: get_tenant_by_id^
SELECT id, name, slug, status, trial_ends_at, created_at
FROM tenants
WHERE id = :tenant_id;

-- name: get_tenant_by_slug^
SELECT id, name, slug, status, trial_ends_at, created_at
FROM tenants
WHERE slug = :slug;

-- name: update_tenant_status^
UPDATE tenants SET status = :new_status, updated_at = now() WHERE id = :tenant_id
RETURNING id, name, slug, status, trial_ends_at, created_at;

-- name: insert_platform_admin_session^
INSERT INTO platform_admin_sessions (id, admin_id, token_hash, expires_at)
VALUES (:id, :admin_id, :token_hash, :expires_at)
RETURNING id;

-- name: get_active_platform_admin_session^
SELECT id, admin_id, token_hash, expires_at
FROM platform_admin_sessions
WHERE id = :session_id AND admin_id = :admin_id
  AND revoked_at IS NULL AND expires_at > now();

-- name: revoke_platform_admin_session!
UPDATE platform_admin_sessions SET revoked_at = now() WHERE id = :session_id;

-- name: insert_audit_log^
INSERT INTO audit_logs (actor_type, actor_id, tenant_id, action, reason)
VALUES (:actor_type, :actor_id, :tenant_id, :action, :reason)
RETURNING id, actor_type, actor_id, tenant_id, action, reason, created_at;

-- name: list_audit_logs
SELECT id, actor_type, actor_id, tenant_id, action, reason, created_at
FROM audit_logs
ORDER BY created_at DESC
LIMIT 200;
