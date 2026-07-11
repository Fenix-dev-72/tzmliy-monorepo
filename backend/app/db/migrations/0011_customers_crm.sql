-- TZ: "Mijozlar, leadlar, mas'ul menejer, telefon deduplication va CRM
-- tarixi." Leads and customers are modeled as the same entity progressing
-- through a pipeline stage (not a separate leads table) -- a lead becomes a
-- customer in place once converted, rather than being copied to a new row.
ALTER TABLE customers ADD COLUMN stage TEXT NOT NULL DEFAULT 'lead'
    CHECK (stage IN ('lead', 'qualified', 'customer', 'lost'));

-- Append-only CRM interaction history ("CRM tarixi") -- manual notes/calls
-- logged by staff, plus an automatic 'status_change' entry whenever stage
-- changes (mirrors sales.sale_changes' change-history pattern).
CREATE TABLE crm_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    customer_id UUID NOT NULL REFERENCES customers(id),
    actor_user_id UUID NOT NULL REFERENCES users(id),
    activity_type TEXT NOT NULL CHECK (activity_type IN ('note', 'call', 'email', 'meeting', 'status_change')),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE crm_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_activities FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON crm_activities
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX crm_activities_customer_idx ON crm_activities (tenant_id, customer_id, created_at);
