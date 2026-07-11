-- name: insert_customer^
INSERT INTO customers (tenant_id, full_name, phone, responsible_user_id, stage)
VALUES (:tenant_id, :full_name, :phone, :responsible_user_id, :stage)
ON CONFLICT (tenant_id, phone) DO NOTHING
RETURNING id, tenant_id, full_name, phone, responsible_user_id, stage, created_at, updated_at;

-- name: get_customer_by_id^
SELECT id, tenant_id, full_name, phone, responsible_user_id, stage, created_at, updated_at
FROM customers
WHERE id = :customer_id;

-- name: get_customer_by_phone^
SELECT id, tenant_id, full_name, phone, responsible_user_id, stage, created_at, updated_at
FROM customers
WHERE phone = :phone;

-- name: list_customers
SELECT id, tenant_id, full_name, phone, responsible_user_id, stage, created_at, updated_at
FROM customers
ORDER BY created_at;

-- name: update_customer^
UPDATE customers
SET full_name = :full_name, phone = :phone, responsible_user_id = :responsible_user_id, stage = :stage, updated_at = now()
WHERE id = :customer_id
RETURNING id, tenant_id, full_name, phone, responsible_user_id, stage, created_at, updated_at;

-- name: user_exists^
SELECT EXISTS(SELECT 1 FROM users WHERE id = :user_id) AS exists;

-- name: insert_customer_activity^
INSERT INTO crm_activities (tenant_id, customer_id, actor_user_id, activity_type, note)
VALUES (:tenant_id, :customer_id, :actor_user_id, :activity_type, :note)
RETURNING id, tenant_id, customer_id, actor_user_id, activity_type, note, created_at;

-- name: list_customer_activities
SELECT id, tenant_id, customer_id, actor_user_id, activity_type, note, created_at
FROM crm_activities
WHERE customer_id = :customer_id
ORDER BY created_at;
