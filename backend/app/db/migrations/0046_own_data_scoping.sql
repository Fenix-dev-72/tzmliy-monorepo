-- Per-user data visibility (2026-07-22, explicit client request): plain
-- `customers.view`/`sales.view`/`calls.view`/`finance.view` now mean "own
-- records only" -- see app/modules/auth/permissions.py's DEFAULT_ROLE_PERMISSIONS
-- comment for the full rationale. This migration:
--   1. adds customers.created_by_user_id (responsible_user_id alone is
--      optional/reassignable, so it can't reliably answer "who created this
--      row" -- see customers/service.py's create_customer for how it's set)
--   2. backfills the four new `*_view_all` permission keys onto existing
--      tenants' admin system role only (mirrors 0017_reports.sql's
--      "reports.view/reports.export: only admin, not manager/agent/finance"
--      precedent) -- new tenants get this automatically via
--      DEFAULT_ROLE_PERMISSIONS["admin"] = ALL_PERMISSIONS.

ALTER TABLE customers ADD COLUMN created_by_user_id UUID REFERENCES users(id);

INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'customers.view_all' FROM roles WHERE name = 'admin' AND is_system = true
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'sales.view_all' FROM roles WHERE name = 'admin' AND is_system = true
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'finance.view_all' FROM roles WHERE name = 'admin' AND is_system = true
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'calls.view_all' FROM roles WHERE name = 'admin' AND is_system = true
ON CONFLICT DO NOTHING;
