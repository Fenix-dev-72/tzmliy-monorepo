-- name: upsert_integration_credential^
INSERT INTO integration_credentials (tenant_id, provider, webhook_secret_encrypted, api_key_encrypted, is_active)
VALUES (:tenant_id, :provider, :webhook_secret_encrypted, :api_key_encrypted, true)
ON CONFLICT (tenant_id, provider)
DO UPDATE SET webhook_secret_encrypted = EXCLUDED.webhook_secret_encrypted,
              api_key_encrypted = EXCLUDED.api_key_encrypted,
              is_active = true,
              updated_at = now()
RETURNING id, tenant_id, provider, is_active, created_at, updated_at;

-- name: list_integration_credentials
SELECT id, tenant_id, provider, is_active, created_at, updated_at
FROM integration_credentials
ORDER BY created_at;

-- name: get_active_integration_credential^
SELECT id, tenant_id, provider, webhook_secret_encrypted, api_key_encrypted, is_active, created_at, updated_at
FROM integration_credentials
WHERE provider = :provider AND is_active = true;

-- name: claim_webhook_event^
-- Idempotency gate, checked BEFORE insert_webhook_event: webhook_events
-- itself carries no uniqueness constraint anymore (it's partitioned by
-- created_at, a server-generated timestamp that isn't stable across
-- retries -- see 0019_infra_partitioning.sql), so this small, unpartitioned
-- table is the real "have we seen this event before" check.
INSERT INTO webhook_event_dedup (tenant_id, provider, external_event_id)
VALUES (:tenant_id, :provider, :external_event_id)
ON CONFLICT (tenant_id, provider, external_event_id) DO NOTHING
RETURNING tenant_id;

-- name: insert_webhook_event^
-- Unconditional insert -- claim_webhook_event above already established this
-- event is new, so this can't conflict.
INSERT INTO webhook_events (tenant_id, provider, external_event_id, raw_payload, signature_valid)
VALUES (:tenant_id, :provider, :external_event_id, :raw_payload::jsonb, :signature_valid)
RETURNING id, tenant_id, provider, external_event_id, raw_payload, signature_valid, processed_at, created_at;

-- name: mark_webhook_event_processed!
UPDATE webhook_events SET processed_at = now() WHERE id = :event_id;

-- name: get_manager_mapping_by_agent^
SELECT id, tenant_id, provider, external_agent_id, user_id, is_active, created_at
FROM call_manager_mappings
WHERE provider = :provider AND external_agent_id = :external_agent_id AND is_active = true;

-- name: insert_manager_mapping^
INSERT INTO call_manager_mappings (tenant_id, provider, external_agent_id, user_id)
VALUES (:tenant_id, :provider, :external_agent_id, :user_id)
ON CONFLICT (tenant_id, provider, external_agent_id) DO NOTHING
RETURNING id, tenant_id, provider, external_agent_id, user_id, is_active, created_at;

-- name: list_manager_mappings
SELECT id, tenant_id, provider, external_agent_id, user_id, is_active, created_at
FROM call_manager_mappings
ORDER BY created_at;

-- name: user_exists^
SELECT EXISTS(SELECT 1 FROM users WHERE id = :user_id) AS exists;

-- name: insert_call^
-- Conflict target includes started_at (the partition key -- see
-- 0019_infra_partitioning.sql): safe because started_at comes from the
-- provider's webhook payload, not a server timestamp, so it's identical
-- across retries of the same event.
INSERT INTO calls (tenant_id, provider, external_call_id, direction, from_number, to_number, responsible_user_id, duration_seconds, status, started_at, ended_at)
VALUES (:tenant_id, :provider, :external_call_id, :direction, :from_number, :to_number, :responsible_user_id, :duration_seconds, :status, :started_at, :ended_at)
ON CONFLICT (tenant_id, provider, external_call_id, started_at) DO NOTHING
RETURNING id, tenant_id, provider, external_call_id, direction, from_number, to_number, responsible_user_id, duration_seconds, recording_object_key, status, started_at, ended_at, created_at;

-- name: get_call_by_external_id^
SELECT id, tenant_id, provider, external_call_id, direction, from_number, to_number, responsible_user_id, duration_seconds, recording_object_key, status, started_at, ended_at, created_at
FROM calls
WHERE provider = :provider AND external_call_id = :external_call_id;

-- name: get_call_by_id^
SELECT id, tenant_id, provider, external_call_id, direction, from_number, to_number, responsible_user_id, duration_seconds, recording_object_key, status, started_at, ended_at, created_at
FROM calls
WHERE id = :call_id;

-- name: update_call_recording_key!
UPDATE calls SET recording_object_key = :recording_object_key WHERE id = :call_id;

-- name: list_calls
SELECT id, tenant_id, provider, external_call_id, direction, from_number, to_number, responsible_user_id, duration_seconds, recording_object_key, status, started_at, ended_at, created_at
FROM calls
WHERE (:responsible_user_id::uuid IS NULL OR responsible_user_id = :responsible_user_id)
ORDER BY started_at DESC;
