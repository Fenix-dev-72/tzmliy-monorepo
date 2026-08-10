-- In-app notification inbox (user_notifications, 0059_notification_inbox.sql)
-- -- separate query file from queries.sql on purpose: that file is entirely
-- Telegram-outbox/reports concerns, this is the per-user bell inbox.

-- name: insert_notification^
INSERT INTO user_notifications (tenant_id, user_id, type, title, body, link)
VALUES (:tenant_id, :user_id, :type, :title, :body, :link)
RETURNING id, tenant_id, user_id, type, title, body, link, is_read, created_at;

-- name: list_inbox
-- Capped at 50 most-recent, same "unbounded history list" convention as
-- complaints/notification_outbox.
SELECT id, tenant_id, user_id, type, title, body, link, is_read, created_at
FROM user_notifications
WHERE user_id = :user_id
ORDER BY created_at DESC
LIMIT :limit;

-- name: count_unread^
SELECT COUNT(*)::int AS count FROM user_notifications WHERE user_id = :user_id AND is_read = false;

-- name: mark_read!
UPDATE user_notifications SET is_read = true WHERE id = :notification_id AND user_id = :user_id;

-- name: mark_all_read!
UPDATE user_notifications SET is_read = true WHERE user_id = :user_id AND is_read = false;

-- name: insert_notifications_bulk!
-- Fan-out to many users in one round trip (broadcast, payment-due warning)
-- -- unnest() turns the :user_ids array param into one row per id.
INSERT INTO user_notifications (tenant_id, user_id, type, title, body, link)
SELECT :tenant_id, unnest(:user_ids::uuid[]), :type, :title, :body, :link;
