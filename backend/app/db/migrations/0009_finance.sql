-- Payments recorded against a sale. idempotency_key makes POST /finance/payments
-- safe to retry: a client that doesn't know whether its previous request
-- landed can resend with the same key and get the original row back instead
-- of double-charging.
CREATE TABLE sale_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    sale_id UUID NOT NULL REFERENCES sales(id),
    amount BIGINT NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL CHECK (currency IN ('UZS', 'USD')),
    method TEXT NOT NULL CHECK (method IN ('cash', 'card', 'click', 'payme', 'manual')),
    idempotency_key TEXT NOT NULL,
    recorded_by_user_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, idempotency_key)
);

ALTER TABLE sale_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_payments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sale_payments
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX sale_payments_sale_idx ON sale_payments (tenant_id, sale_id);

-- pending/approved/rejected workflow envelope for both refund and
-- tariff-change requests. version is optimistic-concurrency, same convention
-- as sales.version.
CREATE TABLE adjustment_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    sale_id UUID NOT NULL REFERENCES sales(id),
    requested_by_user_id UUID NOT NULL REFERENCES users(id),
    type TEXT NOT NULL CHECK (type IN ('refund', 'tariff_change')),
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by_user_id UUID REFERENCES users(id),
    review_reason TEXT,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at TIMESTAMPTZ
);

ALTER TABLE adjustment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE adjustment_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON adjustment_requests
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX adjustment_requests_sale_idx ON adjustment_requests (tenant_id, sale_id);
CREATE INDEX adjustment_requests_status_idx ON adjustment_requests (tenant_id, status);

-- The finalized/immutable artifact created only when a 'refund'
-- adjustment_request is approved. Never updated.
CREATE TABLE refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    sale_id UUID NOT NULL REFERENCES sales(id),
    adjustment_request_id UUID NOT NULL REFERENCES adjustment_requests(id),
    amount BIGINT NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL CHECK (currency IN ('UZS', 'USD')),
    created_by_user_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (adjustment_request_id)
);

ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON refunds
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Append-only source of truth for a sale/customer's balance ("qarz"). Never
-- UPDATE/DELETE — corrections are compensating entries. amount is signed:
-- positive increases what the customer owes, negative decreases it. Balance
-- is always SUM(amount), never a cached column.
CREATE TABLE ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    sale_id UUID REFERENCES sales(id),
    customer_id UUID REFERENCES customers(id),
    entry_type TEXT NOT NULL CHECK (entry_type IN ('charge', 'payment', 'refund', 'adjustment')),
    amount BIGINT NOT NULL,
    currency TEXT NOT NULL CHECK (currency IN ('UZS', 'USD')),
    related_payment_id UUID REFERENCES sale_payments(id),
    related_refund_id UUID REFERENCES refunds(id),
    description TEXT,
    created_by_user_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ledger_entries
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX ledger_entries_sale_idx ON ledger_entries (tenant_id, sale_id);
CREATE INDEX ledger_entries_customer_idx ON ledger_entries (tenant_id, customer_id);

-- Versioned commission rule sets. commission_bps is basis points (500 = 5%)
-- to keep the calculation integer-only, never float.
CREATE TABLE bonus_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    applies_to_role_id UUID NOT NULL REFERENCES roles(id),
    commission_bps INT NOT NULL CHECK (commission_bps >= 0),
    effective_from TIMESTAMPTZ NOT NULL,
    effective_to TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE bonus_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE bonus_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON bonus_plans
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX bonus_plans_role_idx ON bonus_plans (tenant_id, applies_to_role_id, effective_from);

-- Computed on-demand (no scheduler/worker infra exists yet) result of a
-- payroll calculation for one user/period/currency. Re-running calculate for
-- the same period upserts in place.
CREATE TABLE payroll_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    user_id UUID NOT NULL REFERENCES users(id),
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    bonus_plan_id UUID NOT NULL REFERENCES bonus_plans(id),
    base_amount BIGINT NOT NULL,
    bonus_amount BIGINT NOT NULL,
    currency TEXT NOT NULL CHECK (currency IN ('UZS', 'USD')),
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    computed_by_user_id UUID NOT NULL REFERENCES users(id),
    UNIQUE (tenant_id, user_id, period_start, period_end, currency)
);

ALTER TABLE payroll_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payroll_entries
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX payroll_entries_period_idx ON payroll_entries (tenant_id, period_start, period_end);

-- Backfill for already-existing tenants' system roles.
INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'finance.manage' FROM roles WHERE name = 'admin' AND is_system = true
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'finance.view' FROM roles WHERE name = 'admin' AND is_system = true
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'finance.approve' FROM roles WHERE name = 'admin' AND is_system = true
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'finance.view' FROM roles WHERE name = 'manager' AND is_system = true
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'finance.view' FROM roles WHERE name = 'finance' AND is_system = true
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'finance.manage' FROM roles WHERE name = 'finance' AND is_system = true
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'finance.approve' FROM roles WHERE name = 'finance' AND is_system = true
ON CONFLICT DO NOTHING;
