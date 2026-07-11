-- name: insert_role^
INSERT INTO roles (tenant_id, name, is_system)
VALUES (:tenant_id, :name, :is_system)
ON CONFLICT (tenant_id, name) DO NOTHING
RETURNING id, tenant_id, name, is_system, created_at;

-- name: get_role_by_name^
SELECT id, tenant_id, name, is_system, created_at
FROM roles
WHERE tenant_id = :tenant_id AND name = :name;

-- name: get_role_by_id^
SELECT id, tenant_id, name, is_system, created_at
FROM roles
WHERE id = :role_id;

-- name: list_roles
SELECT id, tenant_id, name, is_system, created_at
FROM roles
ORDER BY created_at;

-- name: insert_role_permission!
INSERT INTO role_permissions (role_id, tenant_id, permission_key)
VALUES (:role_id, :tenant_id, :permission_key)
ON CONFLICT DO NOTHING;

-- name: delete_role_permissions!
DELETE FROM role_permissions WHERE role_id = :role_id;

-- name: list_role_permission_keys
SELECT permission_key FROM role_permissions WHERE role_id = :role_id;
