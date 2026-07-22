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
-- Bug fix (2026-07-18, found via a 100k-request load test): no LIMIT at
-- all -- a real tenant normally has a handful of roles, but nothing stopped
-- this from scanning/returning an unbounded number of rows (the test tenant
-- accumulated 5000+ roles from repeated load-test role creation, and this
-- query's p50 went from ~10ms to ~1.7s once it had that many to return).
-- 500 is far more than any real tenant's role count, just a safety cap.
SELECT id, tenant_id, name, is_system, created_at
FROM roles
ORDER BY created_at DESC
LIMIT 500;

-- name: insert_role_permission!
INSERT INTO role_permissions (role_id, tenant_id, permission_key)
VALUES (:role_id, :tenant_id, :permission_key)
ON CONFLICT DO NOTHING;

-- name: delete_role_permissions!
DELETE FROM role_permissions WHERE role_id = :role_id;

-- name: list_role_permission_keys
SELECT permission_key FROM role_permissions WHERE role_id = :role_id;

-- name: list_role_permission_keys_bulk
-- N+1 fix (2026-07-22): list_roles used to call list_role_permission_keys
-- once per role (N+1 queries for N roles). One bulk fetch + Python-side
-- grouping by role_id instead, same "= ANY(...)" pattern finance/service.py's
-- payroll batching uses.
SELECT role_id, permission_key FROM role_permissions WHERE role_id = ANY(:role_ids::uuid[]);
