-- name: get_sale_summary^
-- responsible_user_id is selected purely for the service-layer own-data
-- ownership check (2026-07-22) -- not part of any response schema built
-- directly from this row.
SELECT id, tenant_id, customer_id, currency, price_amount, status, version, responsible_user_id
FROM sales
WHERE id = :sale_id;

-- name: get_sale_summary_for_update^
-- Security-audit fix (2026-07-18): record_payment used to read the ledger
-- balance with a plain SELECT, with no lock -- two concurrent payment
-- requests against the same sale could both read the same pre-payment
-- balance, both pass the "amount <= balance" check, and both insert,
-- overshooting the actual balance (an overpayment race). FOR UPDATE here
-- locks the sale row for the rest of the transaction, so a second concurrent
-- record_payment on the same sale blocks until the first commits (or rolls
-- back) and then sees the up-to-date balance -- same "lock the parent row to
-- serialize a balance check" shape as sales' own optimistic-concurrency
-- version column, just pessimistic instead since money is at stake here.
SELECT id, tenant_id, customer_id, currency, price_amount, status, version
FROM sales
WHERE id = :sale_id
FOR UPDATE;

-- name: insert_payment^
INSERT INTO sale_payments (tenant_id, sale_id, amount, currency, method, idempotency_key, recorded_by_user_id)
VALUES (:tenant_id, :sale_id, :amount, :currency, :method, :idempotency_key, :recorded_by_user_id)
ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
RETURNING id, tenant_id, sale_id, amount, currency, method, idempotency_key, recorded_by_user_id, reversed_at, created_at;

-- name: get_payment_by_idempotency_key^
SELECT id, tenant_id, sale_id, amount, currency, method, idempotency_key, recorded_by_user_id, reversed_at, created_at
FROM sale_payments
WHERE idempotency_key = :idempotency_key;

-- name: get_payment_by_id^
SELECT id, tenant_id, sale_id, amount, currency, method, idempotency_key, recorded_by_user_id, reversed_at, created_at
FROM sale_payments
WHERE id = :payment_id;

-- name: mark_payment_reversed^
UPDATE sale_payments SET reversed_at = now() WHERE id = :payment_id AND reversed_at IS NULL
RETURNING id;

-- name: list_payments_by_sale
SELECT id, tenant_id, sale_id, amount, currency, method, idempotency_key, recorded_by_user_id, reversed_at, created_at
FROM sale_payments
WHERE sale_id = :sale_id
ORDER BY created_at;

-- name: insert_ledger_entry^
INSERT INTO ledger_entries (tenant_id, sale_id, customer_id, entry_type, amount, currency, related_payment_id, related_refund_id, description, created_by_user_id)
VALUES (:tenant_id, :sale_id, :customer_id, :entry_type, :amount, :currency, :related_payment_id, :related_refund_id, :description, :created_by_user_id)
RETURNING id, tenant_id, sale_id, customer_id, entry_type, amount, currency, related_payment_id, related_refund_id, description, created_by_user_id, created_at;

-- name: list_ledger_entries_by_sale
SELECT id, tenant_id, sale_id, customer_id, entry_type, amount, currency, related_payment_id, related_refund_id, description, created_by_user_id, created_at
FROM ledger_entries
WHERE sale_id = :sale_id
ORDER BY created_at;

-- name: get_ledger_balance_by_sale^
SELECT COALESCE(SUM(amount), 0)::bigint AS balance FROM ledger_entries WHERE sale_id = :sale_id;

-- name: get_net_collected_by_sale^
-- Security-audit fix (2026-07-18): 'adjustment' entries (posted by
-- reverse_payment, service.py -- the one-click undo for a mistaken payment)
-- were excluded from this sum, even though they carry the same sign
-- convention as 'refund' (positive amount = money handed back, reducing what
-- was actually collected). A reversed payment used to still count as fully
-- collected here, letting a refund request exceed what the tenant actually
-- still holds.
SELECT COALESCE(-SUM(amount), 0)::bigint AS net_collected
FROM ledger_entries
WHERE sale_id = :sale_id AND entry_type IN ('payment', 'refund', 'adjustment');

-- name: list_customer_outstanding_sales
-- Own-data scoping (2026-07-22): :can_view_all bypasses the filter entirely;
-- otherwise only sales the caller is responsible for.
SELECT s.id AS sale_id, s.catalog_category_id, cc.name AS category_name,
       s.price_amount, s.currency, s.deadline, s.status,
       COALESCE(SUM(le.amount), 0)::bigint AS balance
FROM sales s
LEFT JOIN ledger_entries le ON le.sale_id = s.id
LEFT JOIN catalog_categories cc ON cc.id = s.catalog_category_id
WHERE s.customer_id = :customer_id AND s.status <> 'cancelled'
  AND (:can_view_all OR s.responsible_user_id = :caller_id)
GROUP BY s.id, cc.name
HAVING COALESCE(SUM(le.amount), 0) > 0
ORDER BY s.created_at;

-- name: insert_adjustment_request^
INSERT INTO adjustment_requests (tenant_id, sale_id, requested_by_user_id, type, payload, idempotency_key)
VALUES (:tenant_id, :sale_id, :requested_by_user_id, :type, :payload::jsonb, :idempotency_key)
ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
RETURNING id, tenant_id, sale_id, requested_by_user_id, type, payload, status, reviewed_by_user_id, review_reason, version, idempotency_key, review_idempotency_key, created_at, reviewed_at;

-- name: get_adjustment_request_by_idempotency_key^
SELECT id, tenant_id, sale_id, requested_by_user_id, type, payload, status, reviewed_by_user_id, review_reason, version, idempotency_key, review_idempotency_key, created_at, reviewed_at
FROM adjustment_requests
WHERE idempotency_key = :idempotency_key;

-- name: get_adjustment_request_by_id^
-- sale_responsible_user_id is selected purely for the service-layer own-data
-- ownership check (2026-07-22) -- not part of AdjustmentRequestOut.
SELECT ar.id, ar.tenant_id, ar.sale_id, ar.requested_by_user_id, ar.type, ar.payload, ar.status, ar.reviewed_by_user_id, ar.review_reason, ar.version, ar.idempotency_key, ar.review_idempotency_key, ar.created_at, ar.reviewed_at,
       s.responsible_user_id AS sale_responsible_user_id
FROM adjustment_requests ar
JOIN sales s ON s.id = ar.sale_id
WHERE ar.id = :request_id;

-- name: list_adjustment_requests
-- Capped at 200 most-recent rows (2026-07-17), same "unbounded tenant-wide
-- ORDER BY with no LIMIT" issue as the other lists fixed in this pass.
-- Own-data scoping (2026-07-22): :can_view_all bypasses the join-filter
-- entirely; otherwise only requests against sales the caller is responsible
-- for ("mening savdolarimning moliyaviy tarixi").
SELECT ar.id, ar.tenant_id, ar.sale_id, ar.requested_by_user_id, ar.type, ar.payload, ar.status, ar.reviewed_by_user_id, ar.review_reason, ar.version, ar.idempotency_key, ar.review_idempotency_key, ar.created_at, ar.reviewed_at
FROM adjustment_requests ar
JOIN sales s ON s.id = ar.sale_id
WHERE (:status::text IS NULL OR ar.status = :status)
  AND (:can_view_all OR s.responsible_user_id = :caller_id)
ORDER BY ar.created_at DESC
LIMIT 200;

-- name: update_adjustment_request_status^
UPDATE adjustment_requests
SET status = :new_status, reviewed_by_user_id = :reviewer_user_id, review_reason = :review_reason,
    review_idempotency_key = :review_idempotency_key, version = version + 1, reviewed_at = now()
WHERE id = :request_id AND status = 'pending' AND version = :expected_version
RETURNING id, tenant_id, sale_id, requested_by_user_id, type, payload, status, reviewed_by_user_id, review_reason, version, idempotency_key, review_idempotency_key, created_at, reviewed_at;

-- name: insert_refund^
INSERT INTO refunds (tenant_id, sale_id, adjustment_request_id, amount, currency, created_by_user_id)
VALUES (:tenant_id, :sale_id, :adjustment_request_id, :amount, :currency, :created_by_user_id)
RETURNING id, tenant_id, sale_id, adjustment_request_id, amount, currency, created_by_user_id, created_at;

-- name: insert_bonus_plan^
INSERT INTO bonus_plans (tenant_id, name, applies_to_role_id, bonus_type, commission_bps, fixed_amount, fixed_amount_currency, catalog_category_id, effective_from, effective_to, idempotency_key)
VALUES (:tenant_id, :name, :applies_to_role_id, :bonus_type, :commission_bps, :fixed_amount, :fixed_amount_currency, :catalog_category_id, :effective_from, :effective_to, :idempotency_key)
ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
RETURNING id, tenant_id, name, applies_to_role_id, bonus_type, commission_bps, fixed_amount, fixed_amount_currency, catalog_category_id, effective_from, effective_to, idempotency_key, created_at;

-- name: get_bonus_plan_by_idempotency_key^
SELECT id, tenant_id, name, applies_to_role_id, bonus_type, commission_bps, fixed_amount, fixed_amount_currency, catalog_category_id, effective_from, effective_to, idempotency_key, created_at
FROM bonus_plans
WHERE idempotency_key = :idempotency_key;

-- name: list_bonus_plans
SELECT id, tenant_id, name, applies_to_role_id, bonus_type, commission_bps, fixed_amount, fixed_amount_currency, catalog_category_id, effective_from, effective_to, idempotency_key, created_at
FROM bonus_plans
ORDER BY effective_from DESC
LIMIT :limit OFFSET :offset;

-- name: get_applicable_bonus_plans_bulk
SELECT id, tenant_id, name, applies_to_role_id, bonus_type, commission_bps, fixed_amount, fixed_amount_currency, catalog_category_id, effective_from, effective_to, idempotency_key, created_at
FROM bonus_plans
WHERE applies_to_role_id = ANY(:role_ids::uuid[])
  AND effective_from <= :period_end
  AND (effective_to IS NULL OR effective_to >= :period_start)
ORDER BY applies_to_role_id, catalog_category_id NULLS LAST, effective_from DESC;

-- name: role_exists^
SELECT EXISTS(SELECT 1 FROM roles WHERE id = :role_id) AS exists;

-- name: category_exists^
SELECT EXISTS(SELECT 1 FROM catalog_categories WHERE id = :category_id) AS exists;

-- name: get_user_role_ids_bulk
SELECT id AS user_id, role_id FROM users WHERE id = ANY(:user_ids::uuid[]);

-- name: user_exists^
SELECT EXISTS(SELECT 1 FROM users WHERE id = :user_id) AS exists;

-- name: list_users_with_payments_in_period
SELECT DISTINCT s.responsible_user_id AS user_id
FROM sale_payments sp
JOIN sales s ON s.id = sp.sale_id
WHERE sp.created_at >= :period_start AND sp.created_at < :period_end;

-- name: get_collected_payments_by_user_category_currency_bulk
SELECT s.responsible_user_id AS user_id, s.catalog_category_id AS catalog_category_id, sp.currency AS currency,
       SUM(sp.amount)::bigint AS revenue, COUNT(DISTINCT s.id)::bigint AS sale_count
FROM sale_payments sp
JOIN sales s ON s.id = sp.sale_id
WHERE s.responsible_user_id = ANY(:user_ids::uuid[])
  AND sp.created_at >= :period_start AND sp.created_at < :period_end
GROUP BY s.responsible_user_id, s.catalog_category_id, sp.currency;

-- name: upsert_payroll_entries_bulk
INSERT INTO payroll_entries (tenant_id, user_id, period_start, period_end, bonus_plan_id, base_amount, bonus_amount, currency, computed_by_user_id)
SELECT :tenant_id, u.user_id, :period_start, :period_end, u.bonus_plan_id, u.base_amount, u.bonus_amount, u.currency, :computed_by_user_id
FROM unnest(:user_ids::uuid[], :bonus_plan_ids::uuid[], :base_amounts::bigint[], :bonus_amounts::bigint[], :currencies::text[])
    AS u(user_id, bonus_plan_id, base_amount, bonus_amount, currency)
ON CONFLICT (tenant_id, user_id, period_start, period_end, currency)
DO UPDATE SET bonus_plan_id = EXCLUDED.bonus_plan_id, base_amount = EXCLUDED.base_amount, bonus_amount = EXCLUDED.bonus_amount,
              computed_at = now(), computed_by_user_id = EXCLUDED.computed_by_user_id
RETURNING id, tenant_id, user_id, period_start, period_end, bonus_plan_id, base_amount, bonus_amount, currency, computed_at, computed_by_user_id;

-- name: list_payroll_entries
-- Own-data scoping (2026-07-22): :can_view_all bypasses the filter entirely;
-- otherwise the caller only ever sees their own payroll (:user_id, forced to
-- the caller's own id by the service layer when can_view_all is false).
SELECT id, tenant_id, user_id, period_start, period_end, bonus_plan_id, base_amount, bonus_amount, currency, computed_at, computed_by_user_id
FROM payroll_entries
WHERE (:can_view_all AND (:user_id::uuid IS NULL OR user_id = :user_id)) OR (NOT :can_view_all AND user_id = :caller_id)
ORDER BY period_start DESC
LIMIT :limit OFFSET :offset;

-- name: insert_payroll_job^
INSERT INTO payroll_calculation_jobs (tenant_id, period_start, period_end, user_id, requested_by_user_id)
VALUES (:tenant_id, :period_start, :period_end, :user_id, :requested_by_user_id)
RETURNING id, tenant_id, period_start, period_end, user_id, status, error, requested_by_user_id, created_at, started_at, finished_at;

-- name: get_payroll_job^
SELECT id, tenant_id, period_start, period_end, user_id, status, error, requested_by_user_id, created_at, started_at, finished_at
FROM payroll_calculation_jobs
WHERE id = :job_id;

-- name: claim_pending_payroll_job^
-- Atomic claim (multi-worker safe, 2026-07-14): the old list-then-separately-
-- mark-processing pattern let two worker processes both see the same
-- 'pending' row before either flipped its status, double-processing one
-- payroll run (real double-counted bonuses/commissions) once more than one
-- app process exists (uvicorn --workers, multiple VPS). FOR UPDATE SKIP
-- LOCKED makes each worker skip rows another worker already has locked
-- instead of blocking or double-claiming.
UPDATE payroll_calculation_jobs
SET status = 'processing', started_at = now()
WHERE id = (
    SELECT id FROM payroll_calculation_jobs
    WHERE status = 'pending'
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
)
RETURNING id, tenant_id, period_start, period_end, user_id, status, error, requested_by_user_id, created_at, started_at, finished_at;

-- name: mark_payroll_job_done!
UPDATE payroll_calculation_jobs SET status = 'done', finished_at = now() WHERE id = :job_id;

-- name: mark_payroll_job_failed!
UPDATE payroll_calculation_jobs SET status = 'failed', error = :error, finished_at = now() WHERE id = :job_id;

-- name: get_profit_summary_by_currency
SELECT s.currency AS currency,
       SUM(s.price_amount)::bigint AS revenue,
       COALESCE(SUM(CASE WHEN p.cost_price_currency = s.currency THEN p.cost_price_amount * s.quantity ELSE 0 END), 0)::bigint AS cost
FROM sales s
LEFT JOIN products p ON p.id = s.product_id
WHERE s.status <> 'cancelled'
  AND s.created_at >= :period_start AND s.created_at < :period_end
GROUP BY s.currency;
