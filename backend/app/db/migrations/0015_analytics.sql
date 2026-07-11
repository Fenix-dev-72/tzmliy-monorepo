-- Faza 10: Analytics -- dashboard summary, course/category sales stats,
-- Live Leaderboard (SSE), and per-dashboard password credentials ("dashboard
-- role" from the TZ -- NOT a users/roles row, see CLAUDE.md's RBAC section:
-- users.role_id is NOT NULL and requires an email+password, so a passwordless
-- -email dashboard needs its own table and its own JWT audience).
CREATE TABLE dashboards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
);

ALTER TABLE dashboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboards FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON dashboards
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Backfill (mirrors 0006_catalog.sql's tail). 'agent' gets analytics.view too
-- -- unlike every other *.view key, a seller leaderboard's whole point is to
-- be visible to the sellers being ranked.
INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'analytics.view' FROM roles WHERE name = 'admin' AND is_system = true
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'analytics.manage' FROM roles WHERE name = 'admin' AND is_system = true
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'analytics.view' FROM roles WHERE name = 'manager' AND is_system = true
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'analytics.view' FROM roles WHERE name = 'finance' AND is_system = true
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'analytics.view' FROM roles WHERE name = 'agent' AND is_system = true
ON CONFLICT DO NOTHING;
