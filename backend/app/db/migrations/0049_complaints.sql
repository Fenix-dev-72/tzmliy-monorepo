-- Platform Admin monitoring dashboard (2026-07-22): tenant employees submit
-- complaints/support requests, Platform Admin sees them across every
-- tenant. Deliberately platform-level, no RLS -- same reasoning as
-- audit_logs/tenants: Platform Admin's whole point here is cross-tenant
-- visibility, and a submitting employee never reads this table back
-- (write-only from the tenant side), so there's no tenant-isolation need
-- to enforce on reads.
CREATE TABLE complaints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    created_by_user_id UUID NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
    resolved_by_admin_id UUID REFERENCES platform_admins(id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_complaints_status_created_at ON complaints (status, created_at);
