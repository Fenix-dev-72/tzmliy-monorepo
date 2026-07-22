-- Background payroll calculation (2026-07-12 performance hardening pass).
-- Mutable current-state table (a job has one lifecycle, not a delivery
-- history) -- mirrors notification_outbox's shape (0014_notifications.sql),
-- picked up by app/modules/finance/payroll_worker.py's poll loop instead of
-- computing synchronously inside the POST /finance/payroll/calculate request.
CREATE TABLE payroll_calculation_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    user_id UUID REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
    error TEXT,
    requested_by_user_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ
);

ALTER TABLE payroll_calculation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_calculation_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payroll_calculation_jobs
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX payroll_calculation_jobs_due_idx ON payroll_calculation_jobs (tenant_id, status, created_at);
