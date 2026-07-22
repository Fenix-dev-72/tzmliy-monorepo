-- name: insert_complaint^
INSERT INTO complaints (tenant_id, created_by_user_id, subject, message)
VALUES (:tenant_id, :created_by_user_id, :subject, :message)
RETURNING id, tenant_id, created_by_user_id, subject, message, status, resolved_by_admin_id, resolved_at, created_at;

-- name: list_complaints
-- Capped at 200 most-recent rows, same "unbounded history list" convention
-- as every other list in this repo (crm_lead_syncs, notification_outbox, ...).
SELECT id, tenant_id, created_by_user_id, subject, message, status, resolved_by_admin_id, resolved_at, created_at
FROM complaints
WHERE (:status::text IS NULL OR status = :status)
ORDER BY created_at DESC
LIMIT 200;

-- name: get_complaint_by_id^
SELECT id, tenant_id, created_by_user_id, subject, message, status, resolved_by_admin_id, resolved_at, created_at
FROM complaints
WHERE id = :complaint_id;

-- name: update_complaint_status^
UPDATE complaints
SET status = :new_status,
    resolved_by_admin_id = CASE WHEN :new_status = 'resolved' THEN :admin_id ELSE resolved_by_admin_id END,
    resolved_at = CASE WHEN :new_status = 'resolved' THEN now() ELSE NULL END
WHERE id = :complaint_id
RETURNING id, tenant_id, created_by_user_id, subject, message, status, resolved_by_admin_id, resolved_at, created_at;
