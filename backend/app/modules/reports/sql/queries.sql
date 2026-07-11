-- name: get_sales_without_charge_entry
-- Sales that should always have a 'charge' ledger entry (sales.router's
-- create_sale posts one at creation) but somehow don't -- a data-integrity
-- check, not an expected state.
SELECT s.id AS sale_id, s.customer_id, s.price_amount, s.currency, s.created_at
FROM sales s
WHERE NOT EXISTS (
    SELECT 1 FROM ledger_entries le WHERE le.sale_id = s.id AND le.entry_type = 'charge'
)
ORDER BY s.created_at;

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
SELECT sale_id, currency, SUM(amount)::bigint AS balance
FROM ledger_entries
WHERE sale_id IS NOT NULL
GROUP BY sale_id, currency
HAVING SUM(amount) < 0
ORDER BY sale_id;

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
SELECT id, full_name, phone, stage, responsible_user_id, created_at, updated_at
FROM customers
ORDER BY created_at;

-- name: export_sales
SELECT id, customer_id, catalog_category_id, responsible_user_id, currency, price_amount, deadline, status, created_at
FROM sales
ORDER BY created_at;

-- name: export_ledger_entries
SELECT id, sale_id, customer_id, entry_type, amount, currency, description, created_at
FROM ledger_entries
ORDER BY created_at;

-- name: export_calls
SELECT id, provider, direction, from_number, to_number, responsible_user_id, duration_seconds, status, started_at, ended_at
FROM calls
ORDER BY started_at;
