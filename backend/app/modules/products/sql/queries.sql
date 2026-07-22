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
