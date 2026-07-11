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
ORDER BY created_at;

-- name: get_group_mapping_by_category^
SELECT id, tenant_id, category_id, telegram_chat_id, label, is_active, created_at
FROM telegram_group_mappings
WHERE category_id = :category_id AND is_active = true;

-- name: get_default_group_mapping^
SELECT id, tenant_id, category_id, telegram_chat_id, label, is_active, created_at
FROM telegram_group_mappings
WHERE category_id IS NULL AND is_active = true;

-- name: enqueue_message^
INSERT INTO notification_outbox (tenant_id, channel, telegram_chat_id, text_body, category_id, created_by_user_id)
VALUES (:tenant_id, 'telegram_message', :telegram_chat_id, :text_body, :category_id, :created_by_user_id)
RETURNING id, tenant_id, channel, telegram_chat_id, text_body, document_object_key, document_filename, category_id, status, retry_count, max_retries, next_attempt_at, last_error, created_by_user_id, created_at, sent_at;

-- name: enqueue_document^
INSERT INTO notification_outbox (tenant_id, channel, telegram_chat_id, document_object_key, document_filename, category_id, created_by_user_id)
VALUES (:tenant_id, 'telegram_document', :telegram_chat_id, :document_object_key, :document_filename, :category_id, :created_by_user_id)
RETURNING id, tenant_id, channel, telegram_chat_id, text_body, document_object_key, document_filename, category_id, status, retry_count, max_retries, next_attempt_at, last_error, created_by_user_id, created_at, sent_at;

-- name: list_outbox_for_tenant
SELECT id, tenant_id, channel, telegram_chat_id, text_body, document_object_key, document_filename, category_id, status, retry_count, max_retries, next_attempt_at, last_error, created_by_user_id, created_at, sent_at
FROM notification_outbox
ORDER BY created_at DESC;

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
SELECT id, tenant_id, outbox_id, attempt_number, status, error, attempted_at
FROM notification_delivery_log
WHERE (:outbox_id::uuid IS NULL OR outbox_id = :outbox_id)
ORDER BY attempted_at DESC;

-- name: get_sales_summary_rows
SELECT s.id AS sale_id, c.full_name AS customer_name, s.price_amount, s.currency, s.status, s.created_at
FROM sales s
JOIN customers c ON c.id = s.customer_id
WHERE s.created_at >= :period_start AND s.created_at < :period_end
  AND (:category_id::uuid IS NULL OR s.catalog_category_id = :category_id)
ORDER BY s.created_at;
