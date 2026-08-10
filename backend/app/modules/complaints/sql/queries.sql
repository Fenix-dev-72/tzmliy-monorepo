-- name: insert_complaint^
INSERT INTO complaints (tenant_id, created_by_user_id, subject, message)
VALUES (:tenant_id, :created_by_user_id, :subject, :message)
RETURNING id, tenant_id, created_by_user_id, subject, message, status, resolved_by_admin_id, resolved_at,
    admin_reply, replied_by_admin_id, replied_at, created_at;

-- name: list_complaints
-- Capped at 200 most-recent rows, same "unbounded history list" convention
-- as every other list in this repo (crm_lead_syncs, notification_outbox, ...).
SELECT id, tenant_id, created_by_user_id, subject, message, status, resolved_by_admin_id, resolved_at,
    admin_reply, replied_by_admin_id, replied_at, created_at
FROM complaints
WHERE (:status::text IS NULL OR status = :status)
ORDER BY created_at DESC
LIMIT 200;

-- name: list_my_complaints
-- Tenant-side "my requests" history (SupportPage.tsx) -- scoped to the
-- submitter, same 200-row cap.
SELECT id, tenant_id, created_by_user_id, subject, message, status, resolved_by_admin_id, resolved_at,
    admin_reply, replied_by_admin_id, replied_at, created_at
FROM complaints
WHERE tenant_id = :tenant_id AND created_by_user_id = :user_id
ORDER BY created_at DESC
LIMIT 200;

-- name: get_complaint_by_id^
SELECT id, tenant_id, created_by_user_id, subject, message, status, resolved_by_admin_id, resolved_at,
    admin_reply, replied_by_admin_id, replied_at, created_at
FROM complaints
WHERE id = :complaint_id;

-- name: update_complaint_status^
UPDATE complaints
SET status = :new_status,
    resolved_by_admin_id = CASE WHEN :new_status = 'resolved' THEN :admin_id ELSE resolved_by_admin_id END,
    resolved_at = CASE WHEN :new_status = 'resolved' THEN now() ELSE NULL END
WHERE id = :complaint_id
RETURNING id, tenant_id, created_by_user_id, subject, message, status, resolved_by_admin_id, resolved_at,
    admin_reply, replied_by_admin_id, replied_at, created_at;

-- name: reply_to_complaint^
-- Attaches the admin's response text. Also advances open -> in_progress
-- (a reply means someone's looking at it) but never downgrades an already
-- 'resolved' ticket -- resolving stays a separate, deliberate action.
UPDATE complaints
SET admin_reply = :message,
    replied_by_admin_id = :admin_id,
    replied_at = now(),
    status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END
WHERE id = :complaint_id
RETURNING id, tenant_id, created_by_user_id, subject, message, status, resolved_by_admin_id, resolved_at,
    admin_reply, replied_by_admin_id, replied_at, created_at;
