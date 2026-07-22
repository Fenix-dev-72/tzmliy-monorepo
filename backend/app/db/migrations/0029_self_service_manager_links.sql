-- Self-service employee linking (client requirement, 2026-07-11): each
-- employee links their own Telegram chat (personal reports) and their own
-- CRM manager identity (so inbound leads attribute to the right internal
-- user), instead of the admin configuring it for every employee. UTEL reuses
-- the existing call_manager_mappings table -- only a new self-service
-- endpoint is needed there (app/modules/calls/), no schema change.

-- One-time deep-link token for "click your personal Telegram bot link" --
-- hashed like OTP/password-reset tokens (core/security.py's hash_token),
-- never stored/compared in plaintext.
ALTER TABLE users ADD COLUMN telegram_chat_id BIGINT;
ALTER TABLE users ADD COLUMN telegram_link_token_hash TEXT;
ALTER TABLE users ADD COLUMN telegram_link_token_expires_at TIMESTAMPTZ;

-- Mirrors call_manager_mappings exactly (0012_calls.sql) -- maps a CRM
-- provider's external manager/responsible-user id to a users row, so inbound
-- CRM webhooks can auto-resolve customers.responsible_user_id.
CREATE TABLE crm_manager_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    provider TEXT NOT NULL CHECK (provider IN ('amocrm', 'bitrix24')),
    external_manager_id TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, provider, external_manager_id)
);

ALTER TABLE crm_manager_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_manager_mappings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON crm_manager_mappings
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
