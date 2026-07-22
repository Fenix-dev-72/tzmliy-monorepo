-- Background report export (2026-07-12 performance hardening, part 2).
-- Same shape as payroll_calculation_jobs (0027) and notification_outbox
-- (0014): a dedicated mutable current-state table, picked up by
-- app/modules/reports/export_worker.py instead of generating the CSV/XLSX
-- synchronously inside the GET /reports/export/{entity} request -- the old
-- path did an unbounded fetch plus in-process openpyxl workbook
-- construction directly on the event loop, which could stall every other
-- tenant's requests on this single-worker deployment for large exports.
CREATE TABLE report_export_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    entity TEXT NOT NULL CHECK (entity IN ('customers', 'sales', 'finance', 'calls')),
    format TEXT NOT NULL CHECK (format IN ('csv', 'xlsx')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
    error TEXT,
    file_object_key TEXT,
    requested_by_user_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ
);

ALTER TABLE report_export_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_export_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON report_export_jobs
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX report_export_jobs_due_idx ON report_export_jobs (tenant_id, status, created_at);
