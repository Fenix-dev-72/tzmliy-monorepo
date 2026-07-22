-- Second performance-hardening pass (2026-07-17) -- these three tables grow
-- continuously (one row per lead sync / notification / delivery attempt,
-- with no pruning) and were queried with ORDER BY + no supporting index,
-- forcing a full tenant-scoped sort that gets slower every day a tenant
-- stays active. Mirrors 0026_performance_indexes.sql's reasoning exactly.

CREATE INDEX crm_lead_syncs_synced_idx ON crm_lead_syncs (tenant_id, synced_at DESC);

CREATE INDEX notification_outbox_created_idx ON notification_outbox (tenant_id, created_at DESC);

-- Covers both list_delivery_log's cases: drilling into one message's
-- attempts (outbox_id filter) and the plain "all attempts" listing.
CREATE INDEX notification_delivery_log_outbox_idx ON notification_delivery_log (tenant_id, outbox_id, attempted_at DESC);
CREATE INDEX notification_delivery_log_tenant_idx ON notification_delivery_log (tenant_id, attempted_at DESC);
