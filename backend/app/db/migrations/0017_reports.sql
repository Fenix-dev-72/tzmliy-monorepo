-- Faza 12: Import/export va diagnostika ("faqat ruxsatli adminlarga" -- TZ
-- section 5). No new tables: this is read-only over existing tenant-scoped
-- tables (customers, sales, ledger_entries, calls, adjustment_requests,
-- webhook_events, notification_outbox), so RLS already covers it via the
-- normal tenant_connection() path -- nothing new to enable here.
--
-- Unlike every prior permission addition, this one is backfilled to the
-- 'admin' system role ONLY (not manager/agent/finance) -- the TZ explicitly
-- scopes this to authorized admins, and reports.export in particular is a
-- bulk-data-exfiltration surface (see dashboarduz-security-gaps memory),
-- so it should not be part of any non-admin default role.
INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'reports.view' FROM roles WHERE name = 'admin' AND is_system = true
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'reports.export' FROM roles WHERE name = 'admin' AND is_system = true
ON CONFLICT DO NOTHING;
