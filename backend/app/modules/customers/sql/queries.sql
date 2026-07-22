-- name: insert_customer^
INSERT INTO customers (tenant_id, full_name, phone, responsible_user_id, stage, source, created_by_user_id)
VALUES (:tenant_id, :full_name, :phone, :responsible_user_id, :stage, :source, :created_by_user_id)
ON CONFLICT (tenant_id, phone) DO NOTHING
RETURNING id, tenant_id, full_name, phone, responsible_user_id, stage, source, quality, lost_reason, created_at, updated_at, created_by_user_id;

-- name: get_customer_by_id^
-- created_by_user_id is selected purely for the service-layer ownership
-- check (2026-07-22 own-data scoping) -- CustomerOut doesn't expose it, extra
-- dict keys are dropped at response_model serialization.
SELECT id, tenant_id, full_name, phone, responsible_user_id, stage, source, quality, lost_reason, created_at, updated_at, created_by_user_id
FROM customers
WHERE id = :customer_id;

-- name: get_customer_by_phone^
SELECT id, tenant_id, full_name, phone, responsible_user_id, stage, source, quality, lost_reason, created_at, updated_at
FROM customers
WHERE phone = :phone;

-- name: list_customers
-- Own-data scoping (2026-07-22): :can_view_all bypasses the filter entirely
-- (admin/whoever holds customers.view_all); otherwise only rows the caller
-- is responsible for or created themselves.
SELECT id, tenant_id, full_name, phone, responsible_user_id, stage, source, quality, lost_reason, created_at, updated_at
FROM customers
WHERE (:can_view_all OR responsible_user_id = :caller_id OR created_by_user_id = :caller_id)
ORDER BY created_at
LIMIT :limit OFFSET :offset;

-- name: update_customer^
UPDATE customers
SET full_name = :full_name, phone = :phone, responsible_user_id = :responsible_user_id, stage = :stage, updated_at = now()
WHERE id = :customer_id
RETURNING id, tenant_id, full_name, phone, responsible_user_id, stage, source, quality, lost_reason, created_at, updated_at;

-- name: update_customer_crm_outcome!
-- CRM-driven stage/quality transition (won/lost) -- deliberately separate
-- from update_customer above, which is the full human-edit form and would
-- otherwise overwrite full_name/phone/responsible_user_id with whatever a
-- caller happened to pass.
UPDATE customers
SET stage = :stage, quality = :quality, lost_reason = :lost_reason, updated_at = now()
WHERE id = :customer_id;

-- name: user_exists^
SELECT EXISTS(SELECT 1 FROM users WHERE id = :user_id) AS exists;

-- name: insert_customer_activity^
INSERT INTO crm_activities (tenant_id, customer_id, actor_user_id, activity_type, note)
VALUES (:tenant_id, :customer_id, :actor_user_id, :activity_type, :note)
RETURNING id, tenant_id, customer_id, actor_user_id, activity_type, note, created_at;

-- name: list_customer_activities
-- Capped at 300 most-recent rows (optimize.md #22, 2026-07-17) -- per-
-- customer, so naturally bounded in most cases, but a long-lived customer
-- with heavy CRM sync + manual notes has no hard cap otherwise. No frontend
-- caller exists yet (checked 2026-07-17), so switching to DESC (most recent
-- first) here matches every other "history" list capped this session
-- instead of preserving an unused ASC convention.
SELECT id, tenant_id, customer_id, actor_user_id, activity_type, note, created_at
FROM crm_activities
WHERE customer_id = :customer_id
ORDER BY created_at DESC
LIMIT 300;
