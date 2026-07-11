-- Faza 9: Notifications (Telegram bot, category-mapped group messages, PDF
-- reports, retry/dead-letter delivery pipeline + append-only delivery log).
-- Telegram bot tokens reuse the existing per-tenant integration_credentials
-- table (provider='telegram', token stored encrypted in
-- webhook_secret_encrypted) -- no new credentials table.

-- Tenant-scoped, RLS. Maps a catalog category (nullable = tenant's default
-- group) to a Telegram chat. Two partial unique indexes, not one plain
-- UNIQUE(tenant_id, category_id): Postgres NULLs are never equal, so a plain
-- composite unique constraint would silently allow multiple default-group
-- rows per tenant (the exact gotcha 0006_catalog.sql already documents for
-- sibling category names).
CREATE TABLE telegram_group_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    category_id UUID REFERENCES catalog_categories(id),
    telegram_chat_id BIGINT NOT NULL,
    label TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE telegram_group_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_group_mappings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON telegram_group_mappings
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE UNIQUE INDEX telegram_group_mappings_category_idx
    ON telegram_group_mappings (tenant_id, category_id) WHERE category_id IS NOT NULL;
CREATE UNIQUE INDEX telegram_group_mappings_default_idx
    ON telegram_group_mappings (tenant_id) WHERE category_id IS NULL;

-- Tenant-scoped, RLS. Current delivery state, mutated in place (like
-- adjustment_requests) -- NOT append-only, that's notification_delivery_log
-- below. channel decides which of text_body / document_* is populated.
CREATE TABLE notification_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    channel TEXT NOT NULL CHECK (channel IN ('telegram_message', 'telegram_document')),
    telegram_chat_id BIGINT NOT NULL,
    text_body TEXT,
    document_object_key TEXT,
    document_filename TEXT,
    category_id UUID REFERENCES catalog_categories(id),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'dead_letter')),
    retry_count INT NOT NULL DEFAULT 0,
    max_retries INT NOT NULL DEFAULT 5,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_error TEXT,
    created_by_user_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at TIMESTAMPTZ,
    CHECK (
        (channel = 'telegram_message' AND text_body IS NOT NULL) OR
        (channel = 'telegram_document' AND document_object_key IS NOT NULL AND document_filename IS NOT NULL)
    )
);

ALTER TABLE notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_outbox FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notification_outbox
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX notification_outbox_due_idx ON notification_outbox (tenant_id, status, next_attempt_at);

-- Tenant-scoped, RLS. Append-only audit trail, one row per delivery attempt
-- (success or failure) -- like ledger_entries/webhook_events, never updated.
CREATE TABLE notification_delivery_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    outbox_id UUID NOT NULL REFERENCES notification_outbox(id),
    attempt_number INT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
    error TEXT,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE notification_delivery_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_delivery_log FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notification_delivery_log
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Backfill (mirrors 0012_calls.sql / 0013_billing.sql's tail).
INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'notifications.view' FROM roles WHERE name = 'admin' AND is_system = true
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'notifications.manage' FROM roles WHERE name = 'admin' AND is_system = true
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'notifications.view' FROM roles WHERE name = 'manager' AND is_system = true
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'notifications.view' FROM roles WHERE name = 'finance' AND is_system = true
ON CONFLICT DO NOTHING;
-- 'agent' gets neither key.
