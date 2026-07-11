-- Faza 11: External integrations -- AmoCRM/Bitrix24 lead sync (CRMProvider)
-- and Meta Ads campaign/insight sync. All three use long-lived tokens/URLs,
-- no OAuth (Bitrix24: TZ explicitly allows "OAuth OR server webhook", webhook
-- chosen; Meta Ads: System User token, Meta's own recommended pattern for
-- unattended server integrations -- non-expiring, no refresh-token dance).

-- webhook_secret_encrypted must become nullable: Meta Ads has no webhook at
-- all (pull-only). external_account_id holds AmoCRM's subdomain / Meta's ad
-- account id; Bitrix24 doesn't need it (its one credential IS a full URL).
ALTER TABLE integration_credentials ALTER COLUMN webhook_secret_encrypted DROP NOT NULL;
ALTER TABLE integration_credentials ADD COLUMN external_account_id TEXT;

-- Tenant-scoped, RLS. Append-only audit of every inbound/outbound lead sync
-- attempt -- mirrors webhook_events' idempotency+audit role but CRM-specific,
-- so customers.crm_activities (human-actor notes log) doesn't need a new
-- activity_type / nullable actor_user_id for system-driven events.
CREATE TABLE crm_lead_syncs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    customer_id UUID NOT NULL REFERENCES customers(id),
    provider TEXT NOT NULL CHECK (provider IN ('amocrm', 'bitrix24')),
    external_lead_id TEXT,
    direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    raw_payload JSONB,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE crm_lead_syncs ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_lead_syncs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON crm_lead_syncs
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX crm_lead_syncs_customer_idx ON crm_lead_syncs (tenant_id, customer_id);

-- Tenant-scoped, RLS. Ad platform campaigns (Meta Ads today; provider column
-- keeps this reusable for future ad platforms, same reasoning as calls'
-- generic provider columns).
CREATE TABLE ad_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    provider TEXT NOT NULL CHECK (provider IN ('meta_ads')),
    external_campaign_id TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, provider, external_campaign_id)
);

ALTER TABLE ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_campaigns FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ad_campaigns
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Tenant-scoped, RLS. "Daily insight" per the TZ -- one row per campaign per
-- day. spend_amount stays BIGINT (cents), never float, per project convention.
CREATE TABLE ad_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    campaign_id UUID NOT NULL REFERENCES ad_campaigns(id),
    insight_date DATE NOT NULL,
    impressions BIGINT NOT NULL DEFAULT 0,
    clicks BIGINT NOT NULL DEFAULT 0,
    spend_amount BIGINT NOT NULL DEFAULT 0,
    currency TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, campaign_id, insight_date)
);

ALTER TABLE ad_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_insights FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ad_insights
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Backfill (mirrors 0006_catalog.sql's tail).
INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'crm.view' FROM roles WHERE name = 'admin' AND is_system = true ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'crm.manage' FROM roles WHERE name = 'admin' AND is_system = true ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'crm.view' FROM roles WHERE name = 'manager' AND is_system = true ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'crm.view' FROM roles WHERE name = 'agent' AND is_system = true ON CONFLICT DO NOTHING;
