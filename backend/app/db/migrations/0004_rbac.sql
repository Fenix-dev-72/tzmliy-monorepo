-- Replaces the fixed users.role CHECK-constraint enum with a per-tenant,
-- Tenant-Admin-editable roles/permissions model.
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    is_system BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
);

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON roles
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- tenant_id is denormalized from roles.tenant_id (rather than joining
-- through role_id) because RLS needs a real column on every tenant-scoped
-- table to filter on — it doesn't follow foreign keys.
CREATE TABLE role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    permission_key TEXT NOT NULL,
    PRIMARY KEY (role_id, permission_key)
);

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON role_permissions
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Backfill: seed one system role per (tenant, legacy role name) pair that
-- already has at least one user, with a reasonable default permission set,
-- so existing users can be pointed at a role_id below.
DO $$
DECLARE
    rec RECORD;
    new_role_id UUID;
    perms TEXT[];
BEGIN
    FOR rec IN SELECT DISTINCT tenant_id, role FROM users LOOP
        INSERT INTO roles (tenant_id, name, is_system)
        VALUES (rec.tenant_id, rec.role, true)
        ON CONFLICT (tenant_id, name) DO NOTHING
        RETURNING id INTO new_role_id;

        IF new_role_id IS NULL THEN
            SELECT id INTO new_role_id FROM roles WHERE tenant_id = rec.tenant_id AND name = rec.role;
        END IF;

        perms := CASE rec.role
            WHEN 'admin' THEN ARRAY['users.view', 'users.manage', 'roles.view', 'roles.manage']
            WHEN 'manager' THEN ARRAY['users.view']
            WHEN 'finance' THEN ARRAY['users.view']
            ELSE ARRAY[]::TEXT[]
        END;

        INSERT INTO role_permissions (role_id, tenant_id, permission_key)
        SELECT new_role_id, rec.tenant_id, perm FROM unnest(perms) AS perm
        ON CONFLICT DO NOTHING;
    END LOOP;
END
$$;

ALTER TABLE users ADD COLUMN role_id UUID REFERENCES roles(id);

UPDATE users SET role_id = roles.id
FROM roles
WHERE roles.tenant_id = users.tenant_id AND roles.name = users.role;

ALTER TABLE users ALTER COLUMN role_id SET NOT NULL;
ALTER TABLE users DROP COLUMN role;
