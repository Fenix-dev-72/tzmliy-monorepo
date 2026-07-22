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
SELECT id, tenant_id, provider, webhook_secret_encrypted, api_key_encrypted, external_account_id,
       refresh_token_encrypted, token_expires_at, is_active, created_at, updated_at
FROM integration_credentials
WHERE provider = :provider AND is_active = true;

-- name: list_integration_credentials
-- Backs GET /crm/integrations -- the IntegrationsPage needs to know which
-- providers are already connected (manual-paste or OAuth) on page load, not
-- just right after a same-session configure/connect action.
SELECT id, tenant_id, provider, external_account_id, is_active, created_at, updated_at
FROM integration_credentials
WHERE provider IN ('amocrm', 'bitrix24', 'meta_ads') AND is_active = true;

-- name: deactivate_integration_credential!
-- Backs DELETE /crm/integrations/{provider} (2026-07-17) -- a soft
-- deactivate, not a row delete, so reconnecting later can still reuse
-- get_active_integration_credential_with_account's COALESCE-preserved
-- webhook secret if the admin reconnects the same provider.
UPDATE integration_credentials SET is_active = false, updated_at = now() WHERE provider = :provider;

-- name: upsert_oauth_integration_credential^
-- One-click OAuth connect (2026-07-15). Also carries a webhook_secret now
-- (2026-07-16, client requirement: AmoCRM's own inbound webhook still needs
-- a shared secret regardless of OAuth, since AmoCRM's classic webhooks
-- aren't signed at all -- see providers.py's AmoCrmProvider.verify_webhook)
-- -- COALESCE keeps whatever secret already exists on a reconnect, so
-- re-running OAuth never invalidates a webhook URL the tenant already
-- pasted into their AmoCRM account.
INSERT INTO integration_credentials (tenant_id, provider, webhook_secret_encrypted, api_key_encrypted, external_account_id, refresh_token_encrypted, token_expires_at, is_active)
VALUES (:tenant_id, :provider, :webhook_secret_encrypted, :api_key_encrypted, :external_account_id, :refresh_token_encrypted, :token_expires_at, true)
ON CONFLICT (tenant_id, provider)
DO UPDATE SET api_key_encrypted = EXCLUDED.api_key_encrypted,
              external_account_id = EXCLUDED.external_account_id,
              refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
              token_expires_at = EXCLUDED.token_expires_at,
              webhook_secret_encrypted = COALESCE(integration_credentials.webhook_secret_encrypted, EXCLUDED.webhook_secret_encrypted),
              is_active = true,
              updated_at = now()
RETURNING id, tenant_id, provider, external_account_id, is_active, created_at, updated_at;

-- name: update_integration_credential_tokens!
-- Persists a refreshed access/refresh token pair in place (_get_valid_credential) --
-- doesn't touch external_account_id/webhook_secret_encrypted.
UPDATE integration_credentials
SET api_key_encrypted = :api_key_encrypted,
    refresh_token_encrypted = :refresh_token_encrypted,
    token_expires_at = :token_expires_at,
    updated_at = now()
WHERE tenant_id = :tenant_id AND provider = :provider;

-- name: insert_crm_lead_sync^
INSERT INTO crm_lead_syncs (tenant_id, customer_id, provider, external_lead_id, direction, raw_payload)
VALUES (:tenant_id, :customer_id, :provider, :external_lead_id, :direction, :raw_payload::jsonb)
RETURNING id, tenant_id, customer_id, provider, external_lead_id, direction, raw_payload, synced_at;

-- name: list_crm_lead_syncs
-- Capped at 100 most-recent rows (2026-07-17) -- this is a live activity
-- feed (IntegrationsPage's "Lidlar tarixi", polled every
-- analytics_sse_poll_seconds via /leads/stream), not an audit export; an
-- unbounded SELECT here means every 5s poll re-transfers the tenant's
-- entire lead-sync history, growing without bound as more leads sync in.
SELECT id, tenant_id, customer_id, provider, external_lead_id, direction, raw_payload, synced_at
FROM crm_lead_syncs
ORDER BY synced_at DESC
LIMIT 100;

-- name: insert_crm_manager_mapping^
INSERT INTO crm_manager_mappings (tenant_id, provider, external_manager_id, user_id)
VALUES (:tenant_id, :provider, :external_manager_id, :user_id)
ON CONFLICT (tenant_id, provider, external_manager_id) DO NOTHING
RETURNING id, tenant_id, provider, external_manager_id, user_id, is_active, created_at;

-- name: get_crm_manager_mapping_by_external_id^
SELECT id, tenant_id, provider, external_manager_id, user_id, is_active, created_at
FROM crm_manager_mappings
WHERE provider = :provider AND external_manager_id = :external_manager_id AND is_active = true;

-- name: list_crm_manager_mappings
SELECT id, tenant_id, provider, external_manager_id, user_id, is_active, created_at
FROM crm_manager_mappings
ORDER BY created_at;

-- name: user_has_crm_manager_mapping^
SELECT EXISTS(
    SELECT 1 FROM crm_manager_mappings WHERE user_id = :user_id AND is_active = true
) AS exists;

-- name: get_crm_manager_mapping_by_user^
-- Reverse lookup of the above (external id -> user), used by the
-- per-seller KPI page's Follow-up metric to find which CRM + external
-- manager id a given internal user is linked to.
SELECT id, tenant_id, provider, external_manager_id, user_id, is_active, created_at
FROM crm_manager_mappings
WHERE user_id = :user_id AND is_active = true
LIMIT 1;

-- name: user_exists^
SELECT EXISTS(SELECT 1 FROM users WHERE id = :user_id) AS exists;

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
-- Capped at 365 most-recent rows (optimize.md #22, 2026-07-17) -- one row
-- per campaign per day, synced every meta_ads_sync_poll_seconds (default
-- 6h) forever with no pruning; 365 covers a full year of daily insights.
SELECT id, tenant_id, campaign_id, insight_date, impressions, clicks, spend_amount, currency, created_at
FROM ad_insights
WHERE (:campaign_id::uuid IS NULL OR campaign_id = :campaign_id)
ORDER BY insight_date DESC
LIMIT 365;
