-- Sales contract. catalog_category_id is nullable: a sale usually points at
-- a configured catalog leaf node (e.g. Telefon -> S25 ultra -> Qora -> 512GB)
-- but a freeform/uncategorized contract must still be possible.
CREATE TABLE sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    customer_id UUID NOT NULL REFERENCES customers(id),
    catalog_category_id UUID REFERENCES catalog_categories(id),
    responsible_user_id UUID NOT NULL REFERENCES users(id),
    currency TEXT NOT NULL CHECK (currency IN ('UZS', 'USD')),
    price_amount BIGINT NOT NULL CHECK (price_amount >= 0),
    deadline TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sales
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX sales_customer_idx ON sales (tenant_id, customer_id);
CREATE INDEX sales_responsible_user_idx ON sales (tenant_id, responsible_user_id);
CREATE INDEX sales_status_idx ON sales (tenant_id, status);
CREATE INDEX sales_catalog_category_idx ON sales (tenant_id, catalog_category_id);

-- Append-only change history ("o'zgarishlar tarixi") — never UPDATE/DELETE.
CREATE TABLE sale_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    sale_id UUID NOT NULL REFERENCES sales(id),
    actor_user_id UUID NOT NULL REFERENCES users(id),
    changed_fields JSONB NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE sale_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_changes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sale_changes
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX sale_changes_sale_idx ON sale_changes (tenant_id, sale_id, created_at);

-- Backfill for already-existing tenants' system roles.
INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'sales.manage' FROM roles WHERE name = 'admin' AND is_system = true
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'sales.view' FROM roles WHERE name = 'admin' AND is_system = true
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'sales.manage' FROM roles WHERE name = 'manager' AND is_system = true
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'sales.view' FROM roles WHERE name = 'manager' AND is_system = true
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'sales.manage' FROM roles WHERE name = 'agent' AND is_system = true
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'sales.view' FROM roles WHERE name = 'agent' AND is_system = true
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'sales.view' FROM roles WHERE name = 'finance' AND is_system = true
ON CONFLICT DO NOTHING;
