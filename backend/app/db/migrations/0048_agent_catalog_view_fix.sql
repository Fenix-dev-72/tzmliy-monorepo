-- Fixes 0047_agent_catalog_view.sql, which silently inserted zero rows in
-- production (2026-07-22): role_permissions/roles carry FORCE ROW LEVEL
-- SECURITY, and the migrations DB role is a plain table owner, not
-- BYPASSRLS -- a bare `SELECT ... FROM roles WHERE ...` run without first
-- setting app.tenant_id sees zero rows under RLS, so the previous
-- `INSERT INTO role_permissions SELECT ... FROM roles WHERE ...` had nothing
-- to insert and completed "successfully" with zero effect. This migration
-- does the same backfill but loops per-tenant, setting app.tenant_id via
-- set_config before each tenant's INSERT so RLS actually lets the roles
-- lookup (and the role_permissions WITH CHECK) see/write that tenant's rows.
DO $$
DECLARE
    t RECORD;
BEGIN
    FOR t IN SELECT id FROM tenants LOOP
        PERFORM set_config('app.tenant_id', t.id::text, true);
        INSERT INTO role_permissions (role_id, tenant_id, permission_key)
        SELECT roles.id, roles.tenant_id, 'catalog.view'
        FROM roles
        WHERE roles.tenant_id = t.id AND roles.name = 'agent' AND roles.is_system = true
        ON CONFLICT DO NOTHING;
    END LOOP;
END $$;
