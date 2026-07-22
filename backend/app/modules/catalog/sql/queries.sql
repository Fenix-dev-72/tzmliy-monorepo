-- name: insert_category^
INSERT INTO catalog_categories (tenant_id, parent_id, name)
VALUES (:tenant_id, :parent_id, :name)
RETURNING id, tenant_id, parent_id, name, created_at;

-- name: get_category_by_id^
SELECT id, tenant_id, parent_id, name, created_at
FROM catalog_categories
WHERE id = :category_id;

-- name: list_categories
SELECT id, tenant_id, parent_id, name, created_at
FROM catalog_categories
ORDER BY created_at;

-- name: count_children^
SELECT count(*) AS n FROM catalog_categories WHERE parent_id = :category_id;

-- name: update_category!
UPDATE catalog_categories
SET name = :name, updated_at = now()
WHERE id = :category_id;

-- name: delete_category!
DELETE FROM catalog_categories WHERE id = :category_id;
