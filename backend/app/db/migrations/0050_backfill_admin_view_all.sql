-- Backfill the four *_view_all permissions onto EVERY existing admin system
-- role (2026-07-25). 0046_own_data_scoping backfilled only the admin roles that
-- existed when it ran; tenants created afterwards on an app build whose
-- ALL_PERMISSIONS didn't yet carry these keys got an admin role without them.
-- Found on prod: 4 of 5 admin roles had 27 permissions, missing
-- customers/sales/finance/calls .view_all -- so those tenants' admins saw only
-- their own rows instead of every seller's, breaking the "tenant admin sees
-- everything, employees see only their own" requirement. Idempotent
-- (ON CONFLICT DO NOTHING); the one already-complete admin role is untouched.
-- New tenants already get these via DEFAULT_ROLE_PERMISSIONS["admin"].
--
-- NOTE: permissions are embedded in the access token at issue time, so an
-- affected admin must re-login (or refresh) for the change to take effect.
--
-- PROD RLS CAVEAT (found 2026-07-25): role_permissions carries FORCE ROW LEVEL
-- SECURITY, and on prod the migrations owner role (dashboarduz_owner) is NOT a
-- superuser and does NOT bypass RLS, while migrations run with no app.tenant_id
-- set -- so this INSERT touches 0 rows there (same reason 0046's backfill never
-- reached pre-existing tenants). It works on the local docker DB (owner is
-- superuser). On prod it was applied by running the identical INSERT as the
-- postgres superuser once (INSERT 0 16). Any future backfill INTO an RLS/FORCE
-- table from a migration must account for this (run as superuser, or per-tenant
-- with set_config('app.tenant_id', ...)).
INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT r.id, r.tenant_id, k.permission_key
FROM roles r
CROSS JOIN (VALUES
    ('customers.view_all'),
    ('sales.view_all'),
    ('finance.view_all'),
    ('calls.view_all')
) AS k(permission_key)
WHERE r.name = 'admin' AND r.is_system = true
ON CONFLICT DO NOTHING;
