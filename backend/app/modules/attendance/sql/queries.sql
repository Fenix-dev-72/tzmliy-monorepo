-- name: insert_check_in^
INSERT INTO attendance (tenant_id, user_id, check_in_at, source)
VALUES (:tenant_id, :user_id, COALESCE(:check_in_at::timestamptz, now()), :source)
RETURNING id, tenant_id, user_id, check_in_at, check_out_at, source, created_at;

-- name: check_out^
UPDATE attendance SET check_out_at = now()
WHERE user_id = :user_id AND check_out_at IS NULL
RETURNING id, tenant_id, user_id, check_in_at, check_out_at, source, created_at;

-- name: list_attendance
-- Capped at 500 most-recent rows (2026-07-17) -- this table grows forever
-- (one row per check-in, every day, every employee, tenant-wide when
-- user_id isn't filtered) with no pruning; an unbounded ORDER BY here gets
-- heavier every month a tenant stays active. 500 rows is generous headroom
-- for "recent attendance" without needing a full Load-more UI pass yet.
SELECT id, tenant_id, user_id, check_in_at, check_out_at, source, created_at
FROM attendance
WHERE (:user_id::uuid IS NULL OR user_id = :user_id)
ORDER BY check_in_at DESC
LIMIT 500;

-- name: user_exists^
SELECT EXISTS(SELECT 1 FROM users WHERE id = :user_id) AS exists;
