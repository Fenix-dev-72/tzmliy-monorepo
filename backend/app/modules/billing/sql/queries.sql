-- name: list_billing_plans
SELECT id, code, name, price_amount, currency, billing_period_months, max_users, max_billable_storage_bytes, is_active, created_at, updated_at
FROM billing_plans
ORDER BY price_amount;

-- name: get_billing_plan_by_code^
SELECT id, code, name, price_amount, currency, billing_period_months, max_users, max_billable_storage_bytes, is_active, created_at, updated_at
FROM billing_plans
WHERE code = :code;

-- name: get_billing_plan_by_id^
SELECT id, code, name, price_amount, currency, billing_period_months, max_users, max_billable_storage_bytes, is_active, created_at, updated_at
FROM billing_plans
WHERE id = :billing_plan_id;

-- name: update_billing_plan^
UPDATE billing_plans
SET price_amount = COALESCE(:price_amount, price_amount),
    currency = COALESCE(:currency, currency),
    max_users = COALESCE(:max_users, max_users),
    max_billable_storage_bytes = COALESCE(:max_billable_storage_bytes, max_billable_storage_bytes),
    is_active = COALESCE(:is_active, is_active),
    updated_at = now()
WHERE code = :code
RETURNING id, code, name, price_amount, currency, billing_period_months, max_users, max_billable_storage_bytes, is_active, created_at, updated_at;

-- name: get_tenant_subscription^
SELECT id, tenant_id, billing_plan_id, current_period_start, current_period_end, warning_80_sent_at, warning_100_sent_at, created_at, updated_at
FROM tenant_subscriptions
WHERE tenant_id = :tenant_id;

-- name: upsert_tenant_subscription^
INSERT INTO tenant_subscriptions (tenant_id, billing_plan_id, current_period_start, current_period_end)
VALUES (:tenant_id, :billing_plan_id, :current_period_start, :current_period_end)
ON CONFLICT (tenant_id) DO UPDATE SET
    billing_plan_id = EXCLUDED.billing_plan_id,
    current_period_start = EXCLUDED.current_period_start,
    current_period_end = EXCLUDED.current_period_end,
    updated_at = now()
RETURNING id, tenant_id, billing_plan_id, current_period_start, current_period_end, warning_80_sent_at, warning_100_sent_at, created_at, updated_at;

-- name: extend_tenant_subscription_period^
UPDATE tenant_subscriptions
SET current_period_start = :current_period_start, current_period_end = :current_period_end, updated_at = now()
WHERE tenant_id = :tenant_id
RETURNING id, tenant_id, billing_plan_id, current_period_start, current_period_end, warning_80_sent_at, warning_100_sent_at, created_at, updated_at;

-- name: set_storage_warning_flags^
UPDATE tenant_subscriptions
SET warning_80_sent_at = :warning_80_sent_at, warning_100_sent_at = :warning_100_sent_at, updated_at = now()
WHERE tenant_id = :tenant_id
RETURNING id, tenant_id, billing_plan_id, current_period_start, current_period_end, warning_80_sent_at, warning_100_sent_at, created_at, updated_at;

-- name: insert_subscription_payment^
INSERT INTO subscription_payments (
    tenant_id, tenant_subscription_id, billing_plan_id, provider, amount, currency,
    period_start, period_end, idempotency_key, created_by_user_id, created_by_admin_id
)
VALUES (
    :tenant_id, :tenant_subscription_id, :billing_plan_id, :provider, :amount, :currency,
    :period_start, :period_end, :idempotency_key, :created_by_user_id, :created_by_admin_id
)
ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
RETURNING id, tenant_id, tenant_subscription_id, billing_plan_id, provider, amount, currency, status,
    period_start, period_end, idempotency_key, review_idempotency_key, provider_transaction_id,
    provider_state, cancel_reason, created_by_user_id, created_by_admin_id, created_at, performed_at, cancelled_at;

-- name: get_subscription_payment_by_idempotency_key^
SELECT id, tenant_id, tenant_subscription_id, billing_plan_id, provider, amount, currency, status,
    period_start, period_end, idempotency_key, review_idempotency_key, provider_transaction_id,
    provider_state, cancel_reason, created_by_user_id, created_by_admin_id, created_at, performed_at, cancelled_at
FROM subscription_payments
WHERE idempotency_key = :idempotency_key;

-- name: get_subscription_payment_by_id^
SELECT id, tenant_id, tenant_subscription_id, billing_plan_id, provider, amount, currency, status,
    period_start, period_end, idempotency_key, review_idempotency_key, provider_transaction_id,
    provider_state, cancel_reason, created_by_user_id, created_by_admin_id, created_at, performed_at, cancelled_at
FROM subscription_payments
WHERE id = :payment_id;

-- name: get_subscription_payment_by_provider_txn^
SELECT id, tenant_id, tenant_subscription_id, billing_plan_id, provider, amount, currency, status,
    period_start, period_end, idempotency_key, review_idempotency_key, provider_transaction_id,
    provider_state, cancel_reason, created_by_user_id, created_by_admin_id, created_at, performed_at, cancelled_at
FROM subscription_payments
WHERE provider = :provider AND provider_transaction_id = :provider_transaction_id;

-- name: list_subscription_payments
-- Capped at 200 most-recent rows (optimize.md #19, 2026-07-17) -- same
-- "unbounded history list with no LIMIT" class of issue fixed elsewhere
-- this session (crm_lead_syncs, notification_outbox, attendance).
SELECT id, tenant_id, tenant_subscription_id, billing_plan_id, provider, amount, currency, status,
    period_start, period_end, idempotency_key, review_idempotency_key, provider_transaction_id,
    provider_state, cancel_reason, created_by_user_id, created_by_admin_id, created_at, performed_at, cancelled_at
FROM subscription_payments
ORDER BY created_at DESC
LIMIT 200;

-- name: get_payment_totals_by_status
-- Platform Admin dashboard (2026-07-22): per-tenant totals for a period,
-- grouped by status+currency -- called once per tenant inside a
-- tenant_connection loop (subscription_payments carries RLS, so a single
-- cross-tenant query isn't possible; see platform_dashboard/service.py's
-- get_payments_summary, same tenant-loop shape as billing/service.py's
-- run_dunning).
SELECT status, currency, COUNT(*) AS count, COALESCE(SUM(amount), 0)::bigint AS total_amount
FROM subscription_payments
WHERE created_at >= :period_start AND created_at < :period_end
GROUP BY status, currency;

-- name: set_subscription_payment_provider_transaction^
UPDATE subscription_payments
SET provider_transaction_id = :provider_transaction_id, provider_state = COALESCE(:provider_state, provider_state)
WHERE id = :payment_id AND provider_transaction_id IS NULL
RETURNING id, tenant_id, tenant_subscription_id, billing_plan_id, provider, amount, currency, status,
    period_start, period_end, idempotency_key, review_idempotency_key, provider_transaction_id,
    provider_state, cancel_reason, created_by_user_id, created_by_admin_id, created_at, performed_at, cancelled_at;

-- name: mark_subscription_payment_paid^
UPDATE subscription_payments
SET status = 'paid', performed_at = now(),
    provider_state = COALESCE(:provider_state, provider_state),
    review_idempotency_key = COALESCE(:review_idempotency_key, review_idempotency_key)
WHERE id = :payment_id AND status = 'pending'
RETURNING id, tenant_id, tenant_subscription_id, billing_plan_id, provider, amount, currency, status,
    period_start, period_end, idempotency_key, review_idempotency_key, provider_transaction_id,
    provider_state, cancel_reason, created_by_user_id, created_by_admin_id, created_at, performed_at, cancelled_at;

-- name: mark_subscription_payment_cancelled^
UPDATE subscription_payments
SET status = 'cancelled', cancelled_at = now(),
    provider_state = COALESCE(:provider_state, provider_state),
    cancel_reason = COALESCE(:cancel_reason, cancel_reason),
    review_idempotency_key = COALESCE(:review_idempotency_key, review_idempotency_key)
WHERE id = :payment_id AND status IN ('pending', 'paid')
RETURNING id, tenant_id, tenant_subscription_id, billing_plan_id, provider, amount, currency, status,
    period_start, period_end, idempotency_key, review_idempotency_key, provider_transaction_id,
    provider_state, cancel_reason, created_by_user_id, created_by_admin_id, created_at, performed_at, cancelled_at;

-- name: insert_subscription_payment_provider_ref^
INSERT INTO subscription_payment_provider_refs (provider, provider_transaction_id, tenant_id, subscription_payment_id)
VALUES (:provider, :provider_transaction_id, :tenant_id, :subscription_payment_id)
ON CONFLICT (provider, provider_transaction_id) DO NOTHING
RETURNING provider, provider_transaction_id, tenant_id, subscription_payment_id, created_at;

-- name: get_subscription_payment_provider_ref^
SELECT provider, provider_transaction_id, tenant_id, subscription_payment_id, created_at
FROM subscription_payment_provider_refs
WHERE provider = :provider AND provider_transaction_id = :provider_transaction_id;

-- name: upsert_storage_usage_snapshot^
INSERT INTO storage_usage_snapshots (tenant_id, db_bytes, object_storage_bytes, total_bytes, billable_storage_limit_bytes, usage_ratio_bps)
VALUES (:tenant_id, :db_bytes, :object_storage_bytes, :total_bytes, :billable_storage_limit_bytes, :usage_ratio_bps)
ON CONFLICT (tenant_id, snapshot_date) DO UPDATE SET
    db_bytes = EXCLUDED.db_bytes,
    object_storage_bytes = EXCLUDED.object_storage_bytes,
    total_bytes = EXCLUDED.total_bytes,
    billable_storage_limit_bytes = EXCLUDED.billable_storage_limit_bytes,
    usage_ratio_bps = EXCLUDED.usage_ratio_bps,
    computed_at = now()
RETURNING id, tenant_id, snapshot_date, db_bytes, object_storage_bytes, total_bytes, billable_storage_limit_bytes, usage_ratio_bps, computed_at;

-- name: get_latest_storage_usage_snapshot^
SELECT id, tenant_id, snapshot_date, db_bytes, object_storage_bytes, total_bytes, billable_storage_limit_bytes, usage_ratio_bps, computed_at
FROM storage_usage_snapshots
ORDER BY snapshot_date DESC
LIMIT 1;

-- name: compute_tenant_db_bytes^
-- Approximation: real per-tenant row bytes via pg_column_size, summed across
-- every tenant-scoped table as of this migration. Excludes index/TOAST/dead-
-- tuple overhead. Deliberately NOT pg_total_relation_size -- that sums ALL
-- tenants' rows in these shared tables, which would be wrong for a
-- multi-tenant schema. Run only inside tenant_connection so RLS scopes every
-- inner SELECT to the one tenant already set via app.tenant_id. Whenever a
-- future migration adds a new tenant-scoped table, add it here too.
-- otp_codes/password_reset_tokens/registration_verifications are deliberately
-- absent -- 0022_otp_tables_to_redis.sql dropped them (moved to Redis TTL
-- storage), so they no longer exist as Postgres tables at all; referencing
-- them here used to make this query fail outright with UndefinedTableError.
SELECT (
    COALESCE((SELECT SUM(pg_column_size(t.*)) FROM users t), 0) +
    COALESCE((SELECT SUM(pg_column_size(t.*)) FROM refresh_sessions t), 0) +
    COALESCE((SELECT SUM(pg_column_size(t.*)) FROM roles t), 0) +
    COALESCE((SELECT SUM(pg_column_size(t.*)) FROM role_permissions t), 0) +
    COALESCE((SELECT SUM(pg_column_size(t.*)) FROM catalog_categories t), 0) +
    COALESCE((SELECT SUM(pg_column_size(t.*)) FROM customers t), 0) +
    COALESCE((SELECT SUM(pg_column_size(t.*)) FROM crm_activities t), 0) +
    COALESCE((SELECT SUM(pg_column_size(t.*)) FROM sales t), 0) +
    COALESCE((SELECT SUM(pg_column_size(t.*)) FROM sale_changes t), 0) +
    COALESCE((SELECT SUM(pg_column_size(t.*)) FROM sale_payments t), 0) +
    COALESCE((SELECT SUM(pg_column_size(t.*)) FROM adjustment_requests t), 0) +
    COALESCE((SELECT SUM(pg_column_size(t.*)) FROM refunds t), 0) +
    COALESCE((SELECT SUM(pg_column_size(t.*)) FROM ledger_entries t), 0) +
    COALESCE((SELECT SUM(pg_column_size(t.*)) FROM bonus_plans t), 0) +
    COALESCE((SELECT SUM(pg_column_size(t.*)) FROM payroll_entries t), 0) +
    COALESCE((SELECT SUM(pg_column_size(t.*)) FROM webhook_events t), 0) +
    COALESCE((SELECT SUM(pg_column_size(t.*)) FROM integration_credentials t), 0) +
    COALESCE((SELECT SUM(pg_column_size(t.*)) FROM calls t), 0) +
    COALESCE((SELECT SUM(pg_column_size(t.*)) FROM call_manager_mappings t), 0) +
    COALESCE((SELECT SUM(pg_column_size(t.*)) FROM attendance t), 0) +
    COALESCE((SELECT SUM(pg_column_size(t.*)) FROM tenant_subscriptions t), 0) +
    COALESCE((SELECT SUM(pg_column_size(t.*)) FROM subscription_payments t), 0)
)::bigint AS db_bytes;
