-- Faza 8: Billing / Platform SaaS to'lovi (three fixed tariff plans, Click/
-- Payme/manual invoicing, subscription lifecycle, storage usage tracking).
-- Deliberately NOT the same thing as `finance` (Faza 6), which is a tenant's
-- OWN customer payments/ledger -- this module is the platform billing its
-- tenants for the SaaS product itself.

-- Platform-level catalog, no tenant_id/RLS (reachable only via /platform/v1,
-- like tenants/platform_admins). Exactly three rows, enforced by the CHECK
-- below -- "uchta qat'iy tarif": Platform Admin can edit price/limits via
-- PATCH but cannot create a fourth plan or delete one of the three.
CREATE TABLE billing_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE CHECK (code IN ('starter', 'business', 'enterprise')),
    name TEXT NOT NULL,
    price_amount BIGINT NOT NULL CHECK (price_amount >= 0),
    currency TEXT NOT NULL CHECK (currency IN ('UZS', 'USD')),
    billing_period_months INT NOT NULL DEFAULT 1 CHECK (billing_period_months > 0),
    max_users INT NOT NULL CHECK (max_users > 0),
    max_billable_storage_bytes BIGINT NOT NULL CHECK (max_billable_storage_bytes > 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Illustrative pricing/limits -- Platform Admin edits via PATCH; only the
-- "exactly three plans" shape is an actual TZ requirement, not these numbers.
INSERT INTO billing_plans (code, name, price_amount, currency, max_users, max_billable_storage_bytes) VALUES
    ('starter',    'Starter',    2990000,  'UZS',   5,  5368709120),
    ('business',   'Business',   7990000,  'UZS',  20, 26843545600),
    ('enterprise', 'Enterprise', 19900000, 'UZS', 100, 107374182400);

-- Tenant-scoped, RLS. One active plan assignment per tenant. Lifecycle STATE
-- lives on tenants.status (already has the exact right CHECK values) -- this
-- table only tracks which plan + which billing period is current, plus the
-- 80%/100% storage-warning flags (reset to NULL once usage drops back under
-- the threshold, so crossing it again re-warns).
CREATE TABLE tenant_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id),
    billing_plan_id UUID NOT NULL REFERENCES billing_plans(id),
    current_period_start TIMESTAMPTZ NOT NULL,
    current_period_end TIMESTAMPTZ NOT NULL,
    warning_80_sent_at TIMESTAMPTZ,
    warning_100_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE tenant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant_subscriptions
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Tenant-scoped, RLS. One row per subscription charge attempt (click/payme/
-- manual). amount/currency are the tenant-facing so'm/cents unit --
-- conversion to Payme's tiyin happens only inside providers.py at the
-- protocol boundary, never stored here. Mirrors sale_payments' idempotency
-- shape (Idempotency-Key on create) plus adjustment_requests'
-- review_idempotency_key shape (mutate-in-place guard for mark-paid/webhook
-- transitions).
CREATE TABLE subscription_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    tenant_subscription_id UUID NOT NULL REFERENCES tenant_subscriptions(id),
    billing_plan_id UUID NOT NULL REFERENCES billing_plans(id),
    provider TEXT NOT NULL CHECK (provider IN ('click', 'payme', 'manual')),
    amount BIGINT NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL CHECK (currency IN ('UZS', 'USD')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled', 'failed')),
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    idempotency_key TEXT NOT NULL,
    review_idempotency_key TEXT,
    -- Payme's params.id / Click's click_trans_id, set on first callback.
    provider_transaction_id TEXT,
    provider_state SMALLINT,
    cancel_reason SMALLINT,
    created_by_user_id UUID REFERENCES users(id),
    created_by_admin_id UUID REFERENCES platform_admins(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    performed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    UNIQUE (tenant_id, idempotency_key)
);

ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_payments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON subscription_payments
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX subscription_payments_tenant_status_idx ON subscription_payments (tenant_id, status);
-- Dedup Payme/Click's own transaction id per provider, once known. Partial:
-- excludes the many rows where it's still NULL pre-callback.
CREATE UNIQUE INDEX subscription_payments_provider_txn_idx
    ON subscription_payments (provider, provider_transaction_id)
    WHERE provider_transaction_id IS NOT NULL;

-- Platform-level (no tenant_id column on itself gating access, no RLS).
-- Payme's PerformTransaction/CancelTransaction/CheckTransaction methods carry
-- only Payme's own opaque transaction `id` -- no account/tenant info -- so
-- there is no way to open a tenant_connection(pool, tenant_id) to read the
-- RLS'd subscription_payments row without already knowing its tenant_id.
-- This tiny lookup (populated during CreateTransaction, when tenant_id is
-- still known from account.tenant_id) resolves provider_transaction_id ->
-- tenant_id first, via platform_connection, before opening the real
-- tenant-scoped transaction. Click doesn't need this: its merchant_trans_id
-- is our own identifier (we encode tenant_id into it ourselves), echoed back
-- on every single Click call including Complete.
CREATE TABLE subscription_payment_provider_refs (
    provider TEXT NOT NULL,
    provider_transaction_id TEXT NOT NULL,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    subscription_payment_id UUID NOT NULL REFERENCES subscription_payments(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, provider_transaction_id)
);

-- Tenant-scoped, RLS. Daily(-ish, on-demand -- no scheduler exists yet, see
-- POST /finance/payroll/calculate for the same on-demand-compute precedent)
-- usage snapshot. Append-only history, like ledger_entries/webhook_events;
-- the mutable "have we warned yet" flags live on tenant_subscriptions instead.
CREATE TABLE storage_usage_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    db_bytes BIGINT NOT NULL,
    object_storage_bytes BIGINT NOT NULL,
    total_bytes BIGINT NOT NULL,
    billable_storage_limit_bytes BIGINT NOT NULL,
    usage_ratio_bps INT NOT NULL,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, snapshot_date)
);

ALTER TABLE storage_usage_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_usage_snapshots FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON storage_usage_snapshots
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Backfill: grant the new permission keys to already-existing tenants'
-- system roles (see 0006_catalog.sql for why this backfill is needed).
INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'billing.view' FROM roles WHERE name = 'admin' AND is_system = true
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'billing.manage' FROM roles WHERE name = 'admin' AND is_system = true
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'billing.view' FROM roles WHERE name = 'manager' AND is_system = true
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'billing.view' FROM roles WHERE name = 'finance' AND is_system = true
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'billing.manage' FROM roles WHERE name = 'finance' AND is_system = true
ON CONFLICT DO NOTHING;
-- 'agent' gets neither key -- agents have no billing visibility/authority.
