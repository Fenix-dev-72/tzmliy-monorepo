-- name: insert_sale^
INSERT INTO sales (tenant_id, customer_id, catalog_category_id, responsible_user_id, currency, price_amount, deadline, delivery_mode, idempotency_key, source, product_id, quantity)
VALUES (:tenant_id, :customer_id, :catalog_category_id, :responsible_user_id, :currency, :price_amount, :deadline, :delivery_mode, :idempotency_key, :source, :product_id, :quantity)
ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
RETURNING id, tenant_id, customer_id, catalog_category_id, responsible_user_id, currency, price_amount, deadline, delivery_mode, status, version, idempotency_key, source, product_id, quantity, created_at, updated_at;

-- name: get_sale_by_idempotency_key^
SELECT id, tenant_id, customer_id, catalog_category_id, responsible_user_id, currency, price_amount, deadline, delivery_mode, status, version, idempotency_key, source, product_id, quantity, created_at, updated_at
FROM sales
WHERE idempotency_key = :idempotency_key;

-- name: get_sale_by_id^
SELECT id, tenant_id, customer_id, catalog_category_id, responsible_user_id, currency, price_amount, deadline, delivery_mode, status, version, idempotency_key, source, product_id, quantity, created_at, updated_at
FROM sales
WHERE id = :sale_id;

-- name: list_sales
-- Own-data scoping (2026-07-22): :can_view_all bypasses the filter entirely
-- (admin/whoever holds sales.view_all); otherwise only sales the caller is
-- responsible for -- responsible_user_id is NOT NULL on this table, unlike
-- customers.created_by_user_id, so it's the sole ownership signal here.
SELECT id, tenant_id, customer_id, catalog_category_id, responsible_user_id, currency, price_amount, deadline, delivery_mode, status, version, idempotency_key, source, product_id, quantity, created_at, updated_at
FROM sales
WHERE (:can_view_all OR responsible_user_id = :caller_id)
ORDER BY created_at
LIMIT :limit OFFSET :offset;

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
RETURNING id, tenant_id, customer_id, catalog_category_id, responsible_user_id, currency, price_amount, deadline, delivery_mode, status, version, idempotency_key, source, product_id, quantity, created_at, updated_at;

-- name: update_sale_tariff^
UPDATE sales
SET price_amount = :price_amount,
    deadline = :deadline,
    version = version + 1,
    updated_at = now()
WHERE id = :sale_id AND version = :expected_version
RETURNING id, tenant_id, customer_id, catalog_category_id, responsible_user_id, currency, price_amount, deadline, delivery_mode, status, version, idempotency_key, source, product_id, quantity, created_at, updated_at;

-- name: update_sale_status_from_crm^
-- CRM webhook-driven status transitions (e.g. AmoCRM lead won/lost) only
-- touch `status` -- unlike update_sale/update_sale_tariff above, this never
-- overwrites price/deadline/category set by a human in Tizimly.
UPDATE sales
SET status = :status,
    version = version + 1,
    updated_at = now()
WHERE id = :sale_id AND version = :expected_version
RETURNING id, tenant_id, customer_id, catalog_category_id, responsible_user_id, currency, price_amount, deadline, delivery_mode, status, version, idempotency_key, source, product_id, quantity, created_at, updated_at;

-- name: insert_sale_change^
INSERT INTO sale_changes (tenant_id, sale_id, actor_user_id, changed_fields, reason)
VALUES (:tenant_id, :sale_id, :actor_user_id, :changed_fields::jsonb, :reason)
RETURNING id, tenant_id, sale_id, actor_user_id, changed_fields, reason, created_at;

-- name: list_sale_changes
-- Capped at 300 most-recent rows (optimize.md #22, 2026-07-17) -- per-sale,
-- so naturally bounded normally, but a sale amended repeatedly (e.g. CRM
-- price-sync writes a change row on every AmoCRM price update) has no hard
-- cap otherwise. No frontend caller exists yet (checked 2026-07-17), so
-- switching to DESC matches every other "history" list capped this session.
SELECT id, tenant_id, sale_id, actor_user_id, changed_fields, reason, created_at
FROM sale_changes
WHERE sale_id = :sale_id
ORDER BY created_at DESC
LIMIT 300;

-- name: customer_exists^
SELECT EXISTS(SELECT 1 FROM customers WHERE id = :customer_id) AS exists;

-- name: catalog_category_exists^
SELECT EXISTS(SELECT 1 FROM catalog_categories WHERE id = :catalog_category_id) AS exists;

-- name: user_exists^
SELECT EXISTS(SELECT 1 FROM users WHERE id = :user_id) AS exists;

-- name: get_product_for_sale^
SELECT id, category_id FROM products WHERE id = :product_id;

-- name: decrement_product_stock^
UPDATE products SET stock_quantity = stock_quantity - :quantity, updated_at = now()
WHERE id = :product_id AND stock_quantity >= :quantity
RETURNING id;

-- name: increment_product_stock!
UPDATE products SET stock_quantity = stock_quantity + :quantity, updated_at = now()
WHERE id = :product_id;
