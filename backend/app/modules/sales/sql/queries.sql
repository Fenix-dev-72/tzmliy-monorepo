-- name: insert_sale^
INSERT INTO sales (tenant_id, customer_id, catalog_category_id, responsible_user_id, currency, price_amount, deadline, idempotency_key)
VALUES (:tenant_id, :customer_id, :catalog_category_id, :responsible_user_id, :currency, :price_amount, :deadline, :idempotency_key)
ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
RETURNING id, tenant_id, customer_id, catalog_category_id, responsible_user_id, currency, price_amount, deadline, status, version, idempotency_key, created_at, updated_at;

-- name: get_sale_by_idempotency_key^
SELECT id, tenant_id, customer_id, catalog_category_id, responsible_user_id, currency, price_amount, deadline, status, version, idempotency_key, created_at, updated_at
FROM sales
WHERE idempotency_key = :idempotency_key;

-- name: get_sale_by_id^
SELECT id, tenant_id, customer_id, catalog_category_id, responsible_user_id, currency, price_amount, deadline, status, version, idempotency_key, created_at, updated_at
FROM sales
WHERE id = :sale_id;

-- name: list_sales
SELECT id, tenant_id, customer_id, catalog_category_id, responsible_user_id, currency, price_amount, deadline, status, version, idempotency_key, created_at, updated_at
FROM sales
ORDER BY created_at;

-- name: update_sale^
UPDATE sales
SET catalog_category_id = :catalog_category_id,
    responsible_user_id = :responsible_user_id,
    price_amount = :price_amount,
    deadline = :deadline,
    status = :status,
    version = version + 1,
    updated_at = now()
WHERE id = :sale_id AND version = :expected_version
RETURNING id, tenant_id, customer_id, catalog_category_id, responsible_user_id, currency, price_amount, deadline, status, version, idempotency_key, created_at, updated_at;

-- name: update_sale_tariff^
UPDATE sales
SET price_amount = :price_amount,
    deadline = :deadline,
    version = version + 1,
    updated_at = now()
WHERE id = :sale_id AND version = :expected_version
RETURNING id, tenant_id, customer_id, catalog_category_id, responsible_user_id, currency, price_amount, deadline, status, version, idempotency_key, created_at, updated_at;

-- name: insert_sale_change^
INSERT INTO sale_changes (tenant_id, sale_id, actor_user_id, changed_fields, reason)
VALUES (:tenant_id, :sale_id, :actor_user_id, :changed_fields::jsonb, :reason)
RETURNING id, tenant_id, sale_id, actor_user_id, changed_fields, reason, created_at;

-- name: list_sale_changes
SELECT id, tenant_id, sale_id, actor_user_id, changed_fields, reason, created_at
FROM sale_changes
WHERE sale_id = :sale_id
ORDER BY created_at;

-- name: customer_exists^
SELECT EXISTS(SELECT 1 FROM customers WHERE id = :customer_id) AS exists;

-- name: catalog_category_exists^
SELECT EXISTS(SELECT 1 FROM catalog_categories WHERE id = :catalog_category_id) AS exists;

-- name: user_exists^
SELECT EXISTS(SELECT 1 FROM users WHERE id = :user_id) AS exists;
