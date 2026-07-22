-- name: upsert_group_mapping_for_category^
INSERT INTO telegram_group_mappings (tenant_id, category_id, telegram_chat_id, label)
VALUES (:tenant_id, :category_id, :telegram_chat_id, :label)
ON CONFLICT (tenant_id, category_id) WHERE category_id IS NOT NULL
DO UPDATE SET telegram_chat_id = EXCLUDED.telegram_chat_id, label = EXCLUDED.label, is_active = true
RETURNING id, tenant_id, category_id, telegram_chat_id, label, is_active, created_at;

-- name: upsert_default_group_mapping^
INSERT INTO telegram_group_mappings (tenant_id, category_id, telegram_chat_id, label)
VALUES (:tenant_id, NULL, :telegram_chat_id, :label)
ON CONFLICT (tenant_id) WHERE category_id IS NULL
DO UPDATE SET telegram_chat_id = EXCLUDED.telegram_chat_id, label = EXCLUDED.label, is_active = true
RETURNING id, tenant_id, category_id, telegram_chat_id, label, is_active, created_at;

-- name: list_group_mappings
SELECT id, tenant_id, category_id, telegram_chat_id, label, is_active, created_at
FROM telegram_group_mappings
WHERE is_active = true
ORDER BY created_at;

-- name: update_group_mapping^
UPDATE telegram_group_mappings SET label = :label, category_id = :category_id
WHERE id = :mapping_id
RETURNING id, tenant_id, category_id, telegram_chat_id, label, is_active, created_at;

-- name: deactivate_group_mapping!
UPDATE telegram_group_mappings SET is_active = false WHERE id = :mapping_id;

-- name: delete_group_mapping!
DELETE FROM telegram_group_mappings WHERE id = :mapping_id;

-- name: list_schedules_for_group_mapping
SELECT id, label FROM notification_schedules WHERE group_mapping_id = :mapping_id;

-- name: insert_group_link_request^
INSERT INTO telegram_group_link_requests (tenant_id, token_hash, category_id, label, requested_by_user_id, expires_at)
VALUES (:tenant_id, :token_hash, :category_id, :label, :requested_by_user_id, :expires_at)
RETURNING id, tenant_id, token_hash, category_id, label, requested_by_user_id, expires_at, created_at;

-- name: get_group_link_request_by_token^
SELECT id, tenant_id, token_hash, category_id, label, requested_by_user_id, expires_at, created_at
FROM telegram_group_link_requests
WHERE tenant_id = :tenant_id AND token_hash = :token_hash;

-- name: delete_group_link_request!
DELETE FROM telegram_group_link_requests WHERE id = :id;

-- name: insert_schedule^
INSERT INTO notification_schedules (
    tenant_id, label, send_time, days_of_week, is_enabled, group_mapping_id,
    content_type, period, custom_text, user_ids, role_ids, created_by_user_id
)
VALUES (
    :tenant_id, :label, :send_time, :days_of_week, :is_enabled, :group_mapping_id,
    :content_type, :period, :custom_text, :user_ids, :role_ids, :created_by_user_id
)
RETURNING id, tenant_id, label, send_time, days_of_week, is_enabled, last_sent_date,
          group_mapping_id, content_type, period, custom_text, user_ids, role_ids,
          created_by_user_id, created_at, updated_at;

-- name: update_schedule^
UPDATE notification_schedules
SET label = :label, send_time = :send_time, days_of_week = :days_of_week, is_enabled = :is_enabled,
    group_mapping_id = :group_mapping_id, content_type = :content_type, period = :period,
    custom_text = :custom_text, user_ids = :user_ids, role_ids = :role_ids, updated_at = now()
WHERE id = :schedule_id
RETURNING id, tenant_id, label, send_time, days_of_week, is_enabled, last_sent_date,
          group_mapping_id, content_type, period, custom_text, user_ids, role_ids,
          created_by_user_id, created_at, updated_at;

-- name: get_schedule_by_id^
SELECT id, tenant_id, label, send_time, days_of_week, is_enabled, last_sent_date,
       group_mapping_id, content_type, period, custom_text, user_ids, role_ids,
       created_by_user_id, created_at, updated_at
FROM notification_schedules
WHERE id = :schedule_id;

-- name: list_schedules
SELECT id, tenant_id, label, send_time, days_of_week, is_enabled, last_sent_date,
       group_mapping_id, content_type, period, custom_text, user_ids, role_ids,
       created_by_user_id, created_at, updated_at
FROM notification_schedules
ORDER BY created_at;

-- name: delete_schedule!
DELETE FROM notification_schedules WHERE id = :schedule_id;

-- name: mark_schedule_sent!
UPDATE notification_schedules SET last_sent_date = :sent_date WHERE id = :schedule_id;

-- name: list_enabled_schedules
-- Called by the Celery beat-fed dispatch task, once per tenant -- filters
-- everything else (day-of-week match, send_time passed, not already sent
-- today) in Python, same as the old per-tenant asyncio tick did, since those
-- checks depend on the tenant's fixed Asia/Tashkent "now", not SQL-portable.
SELECT id, tenant_id, label, send_time, days_of_week, is_enabled, last_sent_date,
       group_mapping_id, content_type, period, custom_text, user_ids, role_ids,
       created_by_user_id, created_at, updated_at
FROM notification_schedules
WHERE is_enabled = true;

-- name: get_user_ids_by_roles
SELECT id FROM users WHERE role_id = ANY(:role_ids);

-- name: get_group_mapping_by_category^
SELECT id, tenant_id, category_id, telegram_chat_id, label, is_active, created_at
FROM telegram_group_mappings
WHERE category_id = :category_id AND is_active = true;

-- name: get_default_group_mapping^
SELECT id, tenant_id, category_id, telegram_chat_id, label, is_active, created_at
FROM telegram_group_mappings
WHERE category_id IS NULL AND is_active = true;

-- name: get_group_mapping_by_id^
SELECT id, tenant_id, category_id, telegram_chat_id, label, is_active, created_at
FROM telegram_group_mappings
WHERE id = :mapping_id AND is_active = true;

-- name: enqueue_message^
INSERT INTO notification_outbox (tenant_id, channel, telegram_chat_id, text_body, category_id, created_by_user_id)
VALUES (:tenant_id, 'telegram_message', :telegram_chat_id, :text_body, :category_id, :created_by_user_id)
RETURNING id, tenant_id, channel, telegram_chat_id, text_body, document_object_key, document_filename, category_id, status, retry_count, max_retries, next_attempt_at, last_error, created_by_user_id, created_at, sent_at;

-- name: enqueue_document^
INSERT INTO notification_outbox (tenant_id, channel, telegram_chat_id, document_object_key, document_filename, category_id, created_by_user_id)
VALUES (:tenant_id, 'telegram_document', :telegram_chat_id, :document_object_key, :document_filename, :category_id, :created_by_user_id)
RETURNING id, tenant_id, channel, telegram_chat_id, text_body, document_object_key, document_filename, category_id, status, retry_count, max_retries, next_attempt_at, last_error, created_by_user_id, created_at, sent_at;

-- name: list_outbox_for_tenant
-- Capped at 200 most-recent rows (2026-07-17) -- this is a monitoring/status
-- view (NotificationsPage's outbox tab), not an audit export, and the table
-- grows continuously (one row per outbound message ever sent) with no
-- pruning -- an unbounded SELECT here gets slower and heavier every day a
-- tenant stays active.
SELECT id, tenant_id, channel, telegram_chat_id, text_body, document_object_key, document_filename, category_id, status, retry_count, max_retries, next_attempt_at, last_error, created_by_user_id, created_at, sent_at
FROM notification_outbox
ORDER BY created_at DESC
LIMIT 200;

-- name: get_outbox_message_by_id^
SELECT id, tenant_id, channel, telegram_chat_id, text_body, document_object_key, document_filename, category_id, status, retry_count, max_retries, next_attempt_at, last_error, created_by_user_id, created_at, sent_at
FROM notification_outbox
WHERE id = :id;

-- name: list_due_outbox_messages
SELECT id, tenant_id, channel, telegram_chat_id, text_body, document_object_key, document_filename, category_id, status, retry_count, max_retries, next_attempt_at, last_error, created_by_user_id, created_at, sent_at
FROM notification_outbox
WHERE status = 'pending' AND next_attempt_at <= :now
ORDER BY next_attempt_at;

-- name: mark_outbox_sent^
UPDATE notification_outbox
SET status = 'sent', sent_at = now()
WHERE id = :id AND status = 'pending'
RETURNING id, tenant_id, channel, telegram_chat_id, text_body, document_object_key, document_filename, category_id, status, retry_count, max_retries, next_attempt_at, last_error, created_by_user_id, created_at, sent_at;

-- name: mark_outbox_retry_or_dead_letter^
UPDATE notification_outbox
SET retry_count = retry_count + 1,
    last_error = :last_error,
    next_attempt_at = :next_attempt_at,
    status = CASE WHEN retry_count + 1 >= max_retries THEN 'dead_letter' ELSE 'pending' END
WHERE id = :id
RETURNING id, tenant_id, channel, telegram_chat_id, text_body, document_object_key, document_filename, category_id, status, retry_count, max_retries, next_attempt_at, last_error, created_by_user_id, created_at, sent_at;

-- name: insert_delivery_log^
INSERT INTO notification_delivery_log (tenant_id, outbox_id, attempt_number, status, error)
VALUES (:tenant_id, :outbox_id, :attempt_number, :status, :error)
RETURNING id, tenant_id, outbox_id, attempt_number, status, error, attempted_at;

-- name: list_delivery_log
-- Capped at 200 most-recent rows (2026-07-17), same reasoning as
-- list_outbox_for_tenant above -- one row per delivery *attempt* (including
-- retries), so this grows even faster than the outbox itself.
SELECT id, tenant_id, outbox_id, attempt_number, status, error, attempted_at
FROM notification_delivery_log
WHERE (:outbox_id::uuid IS NULL OR outbox_id = :outbox_id)
ORDER BY attempted_at DESC
LIMIT 200;

-- name: get_sales_summary_rows
SELECT s.id AS sale_id, c.full_name AS customer_name, s.price_amount, s.currency, s.status, s.created_at
FROM sales s
JOIN customers c ON c.id = s.customer_id
WHERE s.created_at >= :period_start AND s.created_at < :period_end
  AND (:category_id::uuid IS NULL OR s.catalog_category_id = :category_id)
ORDER BY s.created_at;
