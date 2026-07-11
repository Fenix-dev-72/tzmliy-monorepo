ALTER TABLE platform_admins ADD COLUMN totp_secret TEXT;
ALTER TABLE platform_admins ADD COLUMN totp_enabled BOOLEAN NOT NULL DEFAULT false;

-- Platform-level, no RLS — written only by platform admin actions that
-- touch tenant data (see tenants/service.py create_tenant_admin_user), read
-- only via /platform routes. Partitioned by month per the TZ; the partition
-- key must be part of the primary key, hence (id, created_at).
CREATE TABLE audit_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    actor_type TEXT NOT NULL CHECK (actor_type IN ('platform_admin')),
    actor_id UUID NOT NULL,
    tenant_id UUID REFERENCES tenants(id),
    action TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Faza 14 (infra hardening) should automate rolling creation of future
-- partitions; for now a few months are created by hand.
CREATE TABLE audit_logs_2026_06 PARTITION OF audit_logs FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE audit_logs_2026_07 PARTITION OF audit_logs FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE audit_logs_2026_08 PARTITION OF audit_logs FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE audit_logs_2026_09 PARTITION OF audit_logs FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
