-- Tenant-defined, arbitrary-depth category tree (e.g. Telefon -> S25 ultra ->
-- Qora -> 512GB). Adjacency-list model: each row just points at its parent.
CREATE TABLE catalog_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    parent_id UUID REFERENCES catalog_categories(id),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE catalog_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_categories FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON catalog_categories
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- A plain UNIQUE(tenant_id, parent_id, name) wouldn't catch duplicate root
-- names, since NULLs are never equal to each other in a unique constraint —
-- hence two partial indexes instead.
CREATE UNIQUE INDEX catalog_categories_root_name_idx
    ON catalog_categories (tenant_id, name) WHERE parent_id IS NULL;
CREATE UNIQUE INDEX catalog_categories_child_name_idx
    ON catalog_categories (tenant_id, parent_id, name) WHERE parent_id IS NOT NULL;

-- Backfill: existing tenants' system roles were seeded before catalog.* existed
-- (see permissions.py's DEFAULT_ROLE_PERMISSIONS docstring) — grant the new
-- keys to them now so this isn't a silent permission gap for already-live tenants.
INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'catalog.manage' FROM roles WHERE name = 'admin' AND is_system = true
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'catalog.view' FROM roles WHERE name = 'admin' AND is_system = true
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'catalog.view' FROM roles WHERE name = 'manager' AND is_system = true
ON CONFLICT DO NOTHING;
