-- name: get_sale_summary^
SELECT id, tenant_id, customer_id, currency, price_amount, status, version
FROM sales
WHERE id = :sale_id;

-- name: insert_payment^
INSERT INTO sale_payments (tenant_id, sale_id, amount, currency, method, idempotency_key, recorded_by_user_id)
VALUES (:tenant_id, :sale_id, :amount, :currency, :method, :idempotency_key, :recorded_by_user_id)
ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
RETURNING id, tenant_id, sale_id, amount, currency, method, idempotency_key, recorded_by_user_id, created_at;

-- name: get_payment_by_idempotency_key^
SELECT id, tenant_id, sale_id, amount, currency, method, idempotency_key, recorded_by_user_id, created_at
FROM sale_payments
WHERE idempotency_key = :idempotency_key;

-- name: list_payments_by_sale
SELECT id, tenant_id, sale_id, amount, currency, method, idempotency_key, recorded_by_user_id, created_at
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
SELECT COALESCE(-SUM(amount), 0)::bigint AS net_collected
FROM ledger_entries
WHERE sale_id = :sale_id AND entry_type IN ('payment', 'refund');

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
SELECT id, tenant_id, sale_id, requested_by_user_id, type, payload, status, reviewed_by_user_id, review_reason, version, idempotency_key, review_idempotency_key, created_at, reviewed_at
FROM adjustment_requests
WHERE id = :request_id;

-- name: list_adjustment_requests
SELECT id, tenant_id, sale_id, requested_by_user_id, type, payload, status, reviewed_by_user_id, review_reason, version, idempotency_key, review_idempotency_key, created_at, reviewed_at
FROM adjustment_requests
WHERE (:status::text IS NULL OR status = :status)
ORDER BY created_at;

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
INSERT INTO bonus_plans (tenant_id, name, applies_to_role_id, commission_bps, effective_from, effective_to, idempotency_key)
VALUES (:tenant_id, :name, :applies_to_role_id, :commission_bps, :effective_from, :effective_to, :idempotency_key)
ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
RETURNING id, tenant_id, name, applies_to_role_id, commission_bps, effective_from, effective_to, idempotency_key, created_at;

-- name: get_bonus_plan_by_idempotency_key^
SELECT id, tenant_id, name, applies_to_role_id, commission_bps, effective_from, effective_to, idempotency_key, created_at
FROM bonus_plans
WHERE idempotency_key = :idempotency_key;

-- name: list_bonus_plans
SELECT id, tenant_id, name, applies_to_role_id, commission_bps, effective_from, effective_to, idempotency_key, created_at
FROM bonus_plans
ORDER BY effective_from DESC;

-- name: get_applicable_bonus_plan^
SELECT id, tenant_id, name, applies_to_role_id, commission_bps, effective_from, effective_to, idempotency_key, created_at
FROM bonus_plans
WHERE applies_to_role_id = :role_id
  AND effective_from <= :period_end
  AND (effective_to IS NULL OR effective_to >= :period_start)
ORDER BY effective_from DESC
LIMIT 1;

-- name: role_exists^
SELECT EXISTS(SELECT 1 FROM roles WHERE id = :role_id) AS exists;

-- name: get_user_role_id^
SELECT role_id FROM users WHERE id = :user_id;

-- name: user_exists^
SELECT EXISTS(SELECT 1 FROM users WHERE id = :user_id) AS exists;

-- name: list_users_with_payments_in_period
SELECT DISTINCT s.responsible_user_id AS user_id
FROM sale_payments sp
JOIN sales s ON s.id = sp.sale_id
WHERE sp.created_at >= :period_start AND sp.created_at < :period_end;

-- name: get_collected_payments_by_currency
SELECT sp.currency AS currency, SUM(sp.amount)::bigint AS total
FROM sale_payments sp
JOIN sales s ON s.id = sp.sale_id
WHERE s.responsible_user_id = :user_id
  AND sp.created_at >= :period_start AND sp.created_at < :period_end
GROUP BY sp.currency;

-- name: upsert_payroll_entry^
INSERT INTO payroll_entries (tenant_id, user_id, period_start, period_end, bonus_plan_id, base_amount, bonus_amount, currency, computed_by_user_id)
VALUES (:tenant_id, :user_id, :period_start, :period_end, :bonus_plan_id, :base_amount, :bonus_amount, :currency, :computed_by_user_id)
ON CONFLICT (tenant_id, user_id, period_start, period_end, currency)
DO UPDATE SET bonus_plan_id = EXCLUDED.bonus_plan_id, base_amount = EXCLUDED.base_amount, bonus_amount = EXCLUDED.bonus_amount,
              computed_at = now(), computed_by_user_id = EXCLUDED.computed_by_user_id
RETURNING id, tenant_id, user_id, period_start, period_end, bonus_plan_id, base_amount, bonus_amount, currency, computed_at, computed_by_user_id;

-- name: list_payroll_entries
SELECT id, tenant_id, user_id, period_start, period_end, bonus_plan_id, base_amount, bonus_amount, currency, computed_at, computed_by_user_id
FROM payroll_entries
WHERE (:user_id::uuid IS NULL OR user_id = :user_id)
ORDER BY period_start DESC;
