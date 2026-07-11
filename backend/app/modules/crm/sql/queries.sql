-- name: upsert_integration_credential_with_account^
INSERT INTO integration_credentials (tenant_id, provider, webhook_secret_encrypted, api_key_encrypted, external_account_id, is_active)
VALUES (:tenant_id, :provider, :webhook_secret_encrypted, :api_key_encrypted, :external_account_id, true)
ON CONFLICT (tenant_id, provider)
DO UPDATE SET webhook_secret_encrypted = EXCLUDED.webhook_secret_encrypted,
              api_key_encrypted = EXCLUDED.api_key_encrypted,
              external_account_id = EXCLUDED.external_account_id,
              is_active = true,
              updated_at = now()
RETURNING id, tenant_id, provider, external_account_id, is_active, created_at, updated_at;

-- name: get_active_integration_credential_with_account^
SELECT id, tenant_id, provider, webhook_secret_encrypted, api_key_encrypted, external_account_id, is_active, created_at, updated_at
FROM integration_credentials
WHERE provider = :provider AND is_active = true;

-- name: insert_crm_lead_sync^
INSERT INTO crm_lead_syncs (tenant_id, customer_id, provider, external_lead_id, direction, raw_payload)
VALUES (:tenant_id, :customer_id, :provider, :external_lead_id, :direction, :raw_payload::jsonb)
RETURNING id, tenant_id, customer_id, provider, external_lead_id, direction, raw_payload, synced_at;

-- name: list_crm_lead_syncs
SELECT id, tenant_id, customer_id, provider, external_lead_id, direction, raw_payload, synced_at
FROM crm_lead_syncs
ORDER BY synced_at DESC;

-- name: upsert_ad_campaign^
INSERT INTO ad_campaigns (tenant_id, provider, external_campaign_id, name, status)
VALUES (:tenant_id, :provider, :external_campaign_id, :name, :status)
ON CONFLICT (tenant_id, provider, external_campaign_id)
DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status, updated_at = now()
RETURNING id, tenant_id, provider, external_campaign_id, name, status, created_at, updated_at;

-- name: list_ad_campaigns
SELECT id, tenant_id, provider, external_campaign_id, name, status, created_at, updated_at
FROM ad_campaigns
ORDER BY name;

-- name: upsert_ad_insight^
INSERT INTO ad_insights (tenant_id, campaign_id, insight_date, impressions, clicks, spend_amount, currency)
VALUES (:tenant_id, :campaign_id, :insight_date, :impressions, :clicks, :spend_amount, :currency)
ON CONFLICT (tenant_id, campaign_id, insight_date)
DO UPDATE SET impressions = EXCLUDED.impressions, clicks = EXCLUDED.clicks, spend_amount = EXCLUDED.spend_amount, currency = EXCLUDED.currency
RETURNING id, tenant_id, campaign_id, insight_date, impressions, clicks, spend_amount, currency, created_at;

-- name: list_ad_insights
SELECT id, tenant_id, campaign_id, insight_date, impressions, clicks, spend_amount, currency, created_at
FROM ad_insights
WHERE (:campaign_id::uuid IS NULL OR campaign_id = :campaign_id)
ORDER BY insight_date DESC;
