-- name: get_sales_without_charge_entry
-- Sales that should always have a 'charge' ledger entry (sales.router's
-- create_sale posts one at creation) but somehow don't -- a data-integrity
-- check, not an expected state. Was scanning the *entire* sales table with
-- no bound at all (optimize.md #18, 2026-07-17) -- now takes the same
-- effective_period_start lookback window get_negative_balance_sales already
-- used, plus a LIMIT, so the response can't balloon into thousands of rows.
SELECT s.id AS sale_id, s.customer_id, s.price_amount, s.currency, s.created_at
FROM sales s
WHERE (:period_start::timestamptz IS NULL OR s.created_at >= :period_start)
  AND NOT EXISTS (
    SELECT 1 FROM ledger_entries le WHERE le.sale_id = s.id AND le.entry_type = 'charge'
)
ORDER BY s.created_at DESC
LIMIT 500;

-- name: get_stale_pending_adjustment_requests
-- refund/tariff_change requests sitting in 'pending' longer than expected --
-- likely stuck waiting on a finance.approve holder.
SELECT id, sale_id, type, created_at, EXTRACT(DAY FROM now() - created_at)::int AS age_days
FROM adjustment_requests
WHERE status = 'pending' AND created_at < now() - make_interval(days => :stale_days)
ORDER BY created_at;

-- name: get_negative_balance_sales
-- A sale's balance is SUM(ledger_entries.amount) (never a cached column, per
-- the append-only ledger convention). Negative means the customer was
-- refunded/credited more than they were ever charged -- worth a manual look.
-- period_start is optional (NULL = full history, every partition) -- the
-- service layer defaults it to a recent lookback window so this doesn't scan
-- every ledger_entries partition on every diagnostics call; filtering on
-- created_at (the partition key) also lets Postgres prune partitions when a
-- window is given.
-- Capped at 500 rows (optimize.md #18, 2026-07-17) -- a large tenant with
-- many anomalies could otherwise return thousands of rows in one response.
SELECT sale_id, currency, SUM(amount)::bigint AS balance
FROM ledger_entries
WHERE sale_id IS NOT NULL
  AND (:period_start::timestamptz IS NULL OR created_at >= :period_start)
GROUP BY sale_id, currency
HAVING SUM(amount) < 0
ORDER BY sale_id
LIMIT 500;

-- name: get_webhook_events_backlog
-- Signature-valid inbound webhooks (calls, billing, CRM) that were persisted
-- but never marked processed -- see calls/service.py's two-phase ingest_webhook.
SELECT provider, count(*)::int AS unprocessed_count, min(created_at) AS oldest_created_at
FROM webhook_events
WHERE processed_at IS NULL AND signature_valid = true
GROUP BY provider
ORDER BY provider;

-- name: get_notification_outbox_backlog
SELECT status, count(*)::int AS count, min(created_at) AS oldest_created_at
FROM notification_outbox
WHERE status IN ('pending', 'failed', 'dead_letter')
GROUP BY status
ORDER BY status;

-- name: export_customers
-- Human-readable export (2026-07-15): responsible_user_id was a raw UUID
-- with nothing else in the file to look it up against -- an ordinary admin
-- opening this in Excel just saw a wall of ids/codes, which read as
-- "encrypted" gibberish rather than a report. Same COALESCE(full_name,
-- email, phone) fallback already used for the seller leaderboard.
SELECT c.id, c.full_name, c.phone, c.stage,
       COALESCE(u.full_name, u.email, u.phone) AS responsible_user_name,
       c.created_at, c.updated_at
FROM customers c
LEFT JOIN users u ON u.id = c.responsible_user_id
ORDER BY c.created_at;

-- name: export_sales
SELECT s.id, cu.full_name AS customer_name, cu.phone AS customer_phone,
       cc.name AS category_name,
       COALESCE(u.full_name, u.email, u.phone) AS responsible_user_name,
       s.currency, s.price_amount, s.deadline, s.status, s.created_at
FROM sales s
JOIN customers cu ON cu.id = s.customer_id
LEFT JOIN catalog_categories cc ON cc.id = s.catalog_category_id
LEFT JOIN users u ON u.id = s.responsible_user_id
ORDER BY s.created_at;

-- name: export_ledger_entries
SELECT le.id, cu.full_name AS customer_name, le.entry_type, le.amount, le.currency, le.description, le.created_at
FROM ledger_entries le
LEFT JOIN customers cu ON cu.id = le.customer_id
ORDER BY le.created_at;

-- name: export_calls
SELECT c.id, c.provider, c.direction, c.from_number, c.to_number,
       COALESCE(u.full_name, u.email, u.phone) AS responsible_user_name,
       c.duration_seconds, c.status, c.started_at, c.ended_at
FROM calls c
LEFT JOIN users u ON u.id = c.responsible_user_id
ORDER BY c.started_at;

-- name: insert_export_job^
INSERT INTO report_export_jobs (tenant_id, entity, format, requested_by_user_id)
VALUES (:tenant_id, :entity, :format, :requested_by_user_id)
RETURNING id, tenant_id, entity, format, status, error, file_object_key, requested_by_user_id, created_at, started_at, finished_at;

-- name: get_export_job^
SELECT id, tenant_id, entity, format, status, error, file_object_key, requested_by_user_id, created_at, started_at, finished_at
FROM report_export_jobs
WHERE id = :job_id;

-- name: claim_pending_export_job^
-- Atomic claim (multi-worker safe, 2026-07-14) -- see finance's
-- claim_pending_payroll_job for the full race-condition rationale (a plain
-- SELECT then separate UPDATE let two worker processes both grab the same
-- job). FOR UPDATE SKIP LOCKED here mainly avoids duplicate/wasted export
-- file generation across processes.
UPDATE report_export_jobs
SET status = 'processing', started_at = now()
WHERE id = (
    SELECT id FROM report_export_jobs
    WHERE status = 'pending'
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
)
RETURNING id, tenant_id, entity, format, status, error, file_object_key, requested_by_user_id, created_at, started_at, finished_at;

-- name: mark_export_job_done!
UPDATE report_export_jobs SET status = 'done', file_object_key = :file_object_key, finished_at = now() WHERE id = :job_id;

-- name: mark_export_job_failed!
UPDATE report_export_jobs SET status = 'failed', error = :error, finished_at = now() WHERE id = :job_id;
