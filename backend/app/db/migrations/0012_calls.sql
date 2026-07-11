-- Generic inbound-webhook idempotency+audit log, reusable by future
-- integration phases (CRM, Telegram, Payme/Click), not just calls. TZ section
-- 9 calls this out for monthly partitioning alongside ledger_entries/calls/
-- audit_logs -- that partitioning is Faza 13/14's job, not done here.
CREATE TABLE webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    provider TEXT NOT NULL,
    external_event_id TEXT NOT NULL,
    raw_payload JSONB NOT NULL,
    signature_valid BOOLEAN NOT NULL,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, provider, external_event_id)
);

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON webhook_events
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Tenant Admin-configured per-provider webhook secret (+ optional API key),
-- encrypted at rest via app/core/crypto.py (Fernet) -- TZ: "Barcha token va
-- secretlar shifrlanadi va loglarda ko'rsatilmaydi."
CREATE TABLE integration_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    provider TEXT NOT NULL,
    webhook_secret_encrypted TEXT NOT NULL,
    api_key_encrypted TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, provider)
);

ALTER TABLE integration_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_credentials FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON integration_credentials
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Normalized internal call record, ingested from provider webhooks.
-- recording_object_key points into object storage (app/core/storage.py),
-- set only after the recording is downloaded -- best-effort, so it can stay
-- NULL if the download fails or no recording exists for the call.
CREATE TABLE calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    provider TEXT NOT NULL,
    external_call_id TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    from_number TEXT NOT NULL,
    to_number TEXT NOT NULL,
    responsible_user_id UUID REFERENCES users(id),
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    recording_object_key TEXT,
    status TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, provider, external_call_id)
);

ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON calls
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX calls_responsible_user_idx ON calls (tenant_id, responsible_user_id, started_at);

-- Maps a provider's telephony extension/agent identifier to a users row, so
-- inbound call webhooks can auto-resolve responsible_user_id.
CREATE TABLE call_manager_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    provider TEXT NOT NULL,
    external_agent_id TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, provider, external_agent_id)
);

ALTER TABLE call_manager_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_manager_mappings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON call_manager_mappings
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Simple check-in/check-out attendance -- no Face ID/biometrics, no shift
-- scheduling (deferred to a future analytics phase).
CREATE TABLE attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    user_id UUID NOT NULL REFERENCES users(id),
    check_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    check_out_at TIMESTAMPTZ,
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'api')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON attendance
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- A user can't check in twice without checking out first.
CREATE UNIQUE INDEX attendance_one_open_per_user ON attendance (tenant_id, user_id) WHERE check_out_at IS NULL;
CREATE INDEX attendance_user_idx ON attendance (tenant_id, user_id, check_in_at);

-- Backfill: grant the new permission keys to already-existing tenants'
-- system roles (see 0006_catalog.sql for why this backfill is needed).
INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'calls.view' FROM roles WHERE name = 'admin' AND is_system = true
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'calls.manage' FROM roles WHERE name = 'admin' AND is_system = true
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'attendance.view' FROM roles WHERE name = 'admin' AND is_system = true
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'attendance.manage' FROM roles WHERE name = 'admin' AND is_system = true
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'calls.view' FROM roles WHERE name = 'manager' AND is_system = true
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'attendance.view' FROM roles WHERE name = 'manager' AND is_system = true
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'calls.view' FROM roles WHERE name = 'agent' AND is_system = true
ON CONFLICT DO NOTHING;
