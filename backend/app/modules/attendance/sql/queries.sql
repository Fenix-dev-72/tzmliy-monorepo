-- name: insert_check_in^
INSERT INTO attendance (tenant_id, user_id, check_in_at, source)
VALUES (:tenant_id, :user_id, COALESCE(:check_in_at::timestamptz, now()), :source)
RETURNING id, tenant_id, user_id, check_in_at, check_out_at, source, created_at;

-- name: check_out^
UPDATE attendance SET check_out_at = now()
WHERE user_id = :user_id AND check_out_at IS NULL
RETURNING id, tenant_id, user_id, check_in_at, check_out_at, source, created_at;

-- name: list_attendance
SELECT id, tenant_id, user_id, check_in_at, check_out_at, source, created_at
FROM attendance
WHERE (:user_id::uuid IS NULL OR user_id = :user_id)
ORDER BY check_in_at DESC;

-- name: user_exists^
SELECT EXISTS(SELECT 1 FROM users WHERE id = :user_id) AS exists;
