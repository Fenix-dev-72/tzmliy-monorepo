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

-- name: upsert_integration_credential_with_account^
INSERT INTO integration_credentials (tenant_id, provider, webhook_secret_encrypted, api_key_encrypted, external_account_id, is_active)
VALUES (:tenant_id, :provider, :webhook_secret_encrypted, :api_key_encrypted, :external_account_id, true)
ON CONFLICT (tenant_id, provider)
DO UPDATE SET webhook_secret_encrypted = EXCLUDED.webhook_secret_encrypted,
              api_key_encrypted = EXCLUDED.api_key_encrypted,
              external_account_id = EXCLUDED.external_account_id,
              is_active = true,
              updated_at = now()
RETURNING id, tenant_id, provider, external_account_id, is_active, created_at, updated_at;

-- name: get_active_integration_credential_with_account^
SELECT id, tenant_id, provider, webhook_secret_encrypted, api_key_encrypted, external_account_id, is_active, created_at, updated_at
FROM integration_credentials
WHERE provider = :provider AND is_active = true;

-- name: get_active_integration_credential^
SELECT id, tenant_id, provider, webhook_secret_encrypted, api_key_encrypted, is_active, created_at, updated_at
FROM integration_credentials
WHERE provider = :provider AND is_active = true;

-- name: deactivate_integration_credential!
UPDATE integration_credentials SET is_active = false, updated_at = now() WHERE provider = :provider;

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

-- name: user_has_manager_mapping^
SELECT EXISTS(
    SELECT 1 FROM call_manager_mappings WHERE user_id = :user_id AND is_active = true
) AS exists;

-- name: user_exists^
SELECT EXISTS(SELECT 1 FROM users WHERE id = :user_id) AS exists;

-- name: insert_call^
-- Conflict target includes started_at (the partition key -- see
-- 0019_infra_partitioning.sql): safe because started_at comes from the
-- provider's webhook payload, not a server timestamp, so it's identical
-- across retries of the same event.
-- Security/correctness audit fix (2026-07-18): was a plain DO NOTHING,
-- meaning a call_ended event arriving after call_started's row already
-- exists (same external_call_id + started_at -- e.g. UTEL, which sends both
-- as separate webhooks for one call) silently discarded its
-- duration/ended_at/status entirely, even once the external_event_id
-- collision above was fixed. Now DO UPDATE, but only when the incoming
-- event actually carries an end time and the existing row doesn't have one
-- yet -- a duplicate/retried call_started redelivery (no ended_at) still
-- can't clobber an already-completed call's real duration.
INSERT INTO calls (tenant_id, provider, external_call_id, direction, from_number, to_number, responsible_user_id, duration_seconds, status, started_at, ended_at)
VALUES (:tenant_id, :provider, :external_call_id, :direction, :from_number, :to_number, :responsible_user_id, :duration_seconds, :status, :started_at, :ended_at)
ON CONFLICT (tenant_id, provider, external_call_id, started_at) DO UPDATE
    SET duration_seconds = EXCLUDED.duration_seconds, status = EXCLUDED.status, ended_at = EXCLUDED.ended_at
    WHERE EXCLUDED.ended_at IS NOT NULL AND calls.ended_at IS NULL
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
UPDATE calls SET recording_object_key = :recording_object_key, pending_recording_url = NULL WHERE id = :call_id;

-- name: set_pending_recording_url!
-- Only when no recording is already stored -- called from ingest_webhook
-- (both the newly-inserted and already-existing-call paths) right after the
-- webhook event is parsed; the actual download happens later, in
-- recording_worker.py, off the request path.
UPDATE calls SET pending_recording_url = :recording_url WHERE id = :call_id AND recording_object_key IS NULL;

-- name: claim_calls_with_pending_recording
-- Atomic claim (multi-worker safe, 2026-07-14) -- the old plain SELECT had
-- no claim step at all, so two worker processes could both download/upload
-- the same recording. recording_claimed_at IS NULL OR older than 5 minutes
-- lets a stale claim (worker crashed mid-download) be retried instead of
-- stuck forever; FOR UPDATE SKIP LOCKED lets concurrent workers split a
-- batch instead of blocking on each other.
UPDATE calls SET recording_claimed_at = now()
WHERE id IN (
    SELECT id FROM calls
    WHERE pending_recording_url IS NOT NULL
      AND (recording_claimed_at IS NULL OR recording_claimed_at < now() - interval '5 minutes')
    ORDER BY created_at
    LIMIT :limit
    FOR UPDATE SKIP LOCKED
)
RETURNING id, tenant_id, pending_recording_url, recording_download_attempts;

-- name: mark_call_recording_failed!
-- Gives up (clears pending_recording_url, same end state as the old
-- log-and-drop failure mode) once recording_download_attempts reaches
-- max_attempts, instead of retrying a permanently-broken URL forever.
UPDATE calls
SET recording_download_attempts = recording_download_attempts + 1,
    pending_recording_url = CASE WHEN recording_download_attempts + 1 >= :max_attempts THEN NULL ELSE pending_recording_url END
WHERE id = :call_id;

-- name: list_calls
-- Own-data scoping (2026-07-22): :can_view_all bypasses the filter entirely
-- (admin/whoever holds calls.view_all); otherwise only calls attributed to
-- the caller via call_manager_mappings (responsible_user_id). Replaces the
-- old client-supplied :responsible_user_id filter param -- ownership is now
-- always server-computed from the caller's own session, never a query arg.
SELECT id, tenant_id, provider, external_call_id, direction, from_number, to_number, responsible_user_id, duration_seconds, recording_object_key, status, started_at, ended_at, created_at
FROM calls
WHERE (:can_view_all OR responsible_user_id = :caller_id)
ORDER BY started_at DESC
LIMIT :limit OFFSET :offset;

-- name: customer_has_missed_call^
-- Seller/lead analytics (2026-07-15): backs the "sifatsiz lid" (low-quality
-- lead) determination -- "no phone left OR called and never answered" is
-- one half of that definition. duration_seconds = 0 is this module's own
-- "missed" convention (see AmoCrmProvider.list_calls's status field).
SELECT EXISTS(
    SELECT 1 FROM calls
    WHERE (from_number = :phone OR to_number = :phone) AND duration_seconds = 0
) AS exists;
