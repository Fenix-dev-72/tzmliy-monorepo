-- name: insert_product^
INSERT INTO products (tenant_id, category_id, name, cost_price_amount, cost_price_currency, sell_price_amount, sell_price_currency, stock_quantity)
VALUES (:tenant_id, :category_id, :name, :cost_price_amount, :cost_price_currency, :sell_price_amount, :sell_price_currency, :stock_quantity)
RETURNING id, tenant_id, category_id, name, cost_price_amount, cost_price_currency, sell_price_amount, sell_price_currency, stock_quantity, photo_object_key, created_at, updated_at;

-- name: get_product_by_id^
SELECT id, tenant_id, category_id, name, cost_price_amount, cost_price_currency, sell_price_amount, sell_price_currency, stock_quantity, photo_object_key, created_at, updated_at
FROM products
WHERE id = :product_id;

-- name: list_products
SELECT id, tenant_id, category_id, name, cost_price_amount, cost_price_currency, sell_price_amount, sell_price_currency, stock_quantity, photo_object_key, created_at, updated_at
FROM products
WHERE (:category_id::uuid IS NULL OR category_id = :category_id)
ORDER BY created_at;

-- name: update_product!
UPDATE products
SET name = :name, category_id = :category_id, cost_price_amount = :cost_price_amount, cost_price_currency = :cost_price_currency,
    sell_price_amount = :sell_price_amount, sell_price_currency = :sell_price_currency, updated_at = now()
WHERE id = :product_id;

-- name: delete_product!
DELETE FROM products WHERE id = :product_id;

-- name: adjust_stock^
UPDATE products SET stock_quantity = stock_quantity + :delta, updated_at = now()
WHERE id = :product_id AND stock_quantity + :delta >= 0
RETURNING id, tenant_id, category_id, name, cost_price_amount, cost_price_currency, sell_price_amount, sell_price_currency, stock_quantity, photo_object_key, created_at, updated_at;

-- name: set_product_photo!
UPDATE products SET photo_object_key = :photo_object_key, updated_at = now() WHERE id = :product_id;

-- name: category_exists^
SELECT EXISTS(SELECT 1 FROM catalog_categories WHERE id = :category_id) AS exists;

-- Warehouse statistics (owner request 2026-07-13): total stock, most-overstocked
-- products, and slowest-moving products. No schema change -- all derived from
-- products.stock_quantity and sales.product_id (a sale decrements stock).

-- name: get_warehouse_totals^
SELECT count(*)::int AS total_products, COALESCE(SUM(stock_quantity), 0)::bigint AS total_units
FROM products;

-- name: get_warehouse_value_by_currency
-- Retail value of on-hand stock per currency (stock_quantity * sell price).
SELECT sell_price_currency AS currency, SUM(stock_quantity * sell_price_amount)::bigint AS value
FROM products
WHERE stock_quantity > 0
GROUP BY sell_price_currency
ORDER BY value DESC;

-- name: get_most_stocked_products
-- "Eng ko'p qolib ketgan": products with the most units still on hand.
SELECT id AS product_id, name, stock_quantity
FROM products
WHERE stock_quantity > 0
ORDER BY stock_quantity DESC, name
LIMIT :limit;

-- name: get_slow_moving_products
-- "Uzoq sotilmagan": products that still have stock, ranked by how long since
-- their last non-cancelled sale -- never-sold first (NULLS FIRST).
SELECT p.id AS product_id, p.name, p.stock_quantity, MAX(s.created_at) AS last_sold_at
FROM products p
LEFT JOIN sales s ON s.product_id = p.id AND s.status <> 'cancelled'
WHERE p.stock_quantity > 0
GROUP BY p.id, p.name, p.stock_quantity
ORDER BY MAX(s.created_at) ASC NULLS FIRST, p.stock_quantity DESC
LIMIT :limit;
