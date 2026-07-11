-- Faza 13 (infra/performance hardening): monthly partitioning for the three
-- high-volume append-mostly tables the TZ names alongside audit_logs
-- (already partitioned since 0005) -- ledger_entries, calls, webhook_events.
-- Partition pruning keeps per-query index size bounded as these tables grow
-- toward the TZ's 10M-financial-row target, and old partitions can later be
-- dropped/archived far more cheaply than a DELETE.
--
-- Postgres requires every unique constraint (including the primary key) on a
-- partitioned table to include the partition key column. Each table below
-- picks that column deliberately:
--   - ledger_entries: no pre-existing unique/idempotency constraint besides
--     the PK, so this is a mechanical PK -> (id, created_at) change.
--   - calls: partitioned by started_at (the call's actual start time, taken
--     from the provider's webhook payload), NOT created_at. started_at is
--     stable across webhook retries of the same event, so folding it into
--     the existing idempotency constraint --
--     UNIQUE(tenant_id, provider, external_call_id) ->
--     UNIQUE(tenant_id, provider, external_call_id, started_at) -- doesn't
--     weaken retry-safety in practice.
--   - webhook_events: created_at is DEFAULT now() (server-generated, NOT
--     supplied by the caller), so it is NOT stable across retries -- folding
--     it into the idempotency constraint the same way calls' started_at was
--     would make ON CONFLICT DO NOTHING match only if two inserts landed in
--     the same microsecond, silently breaking retry dedup entirely (not just
--     at month boundaries -- on every single retry). Instead, webhook_events
--     loses its own uniqueness constraint and a new, small, UNPARTITIONED
--     dedup table (webhook_event_dedup) becomes the real idempotency gate,
--     checked before the (now unconditional) insert into the partitioned
--     audit table. Same "small lookup table solves a partition-key
--     constraint problem" shape as billing's subscription_payment_provider_refs
--     (Faza 8).
--
-- RLS note: policies defined on a partitioned (parent) table apply
-- automatically to every partition when queried through the parent -- no
-- need to (and this migration does not) enable RLS separately on each
-- monthly partition. This only holds for access via the parent table name,
-- which is all the app ever does (partition names are an internal
-- implementation detail app code never references).
--
-- DEFAULT partition note: each table below gets a DEFAULT partition as a
-- safety net so an INSERT with an out-of-range created_at/started_at fails
-- open (goes into the default bucket) rather than erroring outright. Once a
-- DEFAULT partition holds rows in a given month, a new named partition for
-- that month can no longer be attached without first moving that data out --
-- Faza 14's partition-automation job must create each month's partition
-- ahead of time, not rely on the default as a substitute.

-- --- webhook_event_dedup (new, small, unpartitioned) ---------------------
CREATE TABLE webhook_event_dedup (
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    provider TEXT NOT NULL,
    external_event_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, provider, external_event_id)
);

ALTER TABLE webhook_event_dedup ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_event_dedup FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON webhook_event_dedup
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Backfill: seed the dedup gate from every webhook_events row that already
-- exists, so a retry of an event received before this migration isn't
-- treated as brand new afterward.
INSERT INTO webhook_event_dedup (tenant_id, provider, external_event_id, created_at)
SELECT tenant_id, provider, external_event_id, created_at FROM webhook_events
ON CONFLICT DO NOTHING;

-- --- ledger_entries: PK (id) -> (id, created_at), PARTITION BY created_at ---
-- Renaming a table does NOT rename its indexes/constraints, so free up their
-- names too before creating the replacement table -- they're dropped for
-- good once ledger_entries_unpartitioned is dropped below.
ALTER TABLE ledger_entries RENAME TO ledger_entries_unpartitioned;
ALTER INDEX ledger_entries_pkey RENAME TO ledger_entries_unpartitioned_pkey;
ALTER INDEX ledger_entries_sale_idx RENAME TO ledger_entries_unpartitioned_sale_idx;
ALTER INDEX ledger_entries_customer_idx RENAME TO ledger_entries_unpartitioned_customer_idx;

CREATE TABLE ledger_entries (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    sale_id UUID REFERENCES sales(id),
    customer_id UUID REFERENCES customers(id),
    entry_type TEXT NOT NULL CHECK (entry_type IN ('charge', 'payment', 'refund', 'adjustment')),
    amount BIGINT NOT NULL,
    currency TEXT NOT NULL CHECK (currency IN ('UZS', 'USD')),
    related_payment_id UUID REFERENCES sale_payments(id),
    related_refund_id UUID REFERENCES refunds(id),
    description TEXT,
    created_by_user_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ledger_entries
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX ledger_entries_sale_idx ON ledger_entries (tenant_id, sale_id);
CREATE INDEX ledger_entries_customer_idx ON ledger_entries (tenant_id, customer_id);

CREATE TABLE ledger_entries_default PARTITION OF ledger_entries DEFAULT;
CREATE TABLE ledger_entries_2026_06 PARTITION OF ledger_entries FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE ledger_entries_2026_07 PARTITION OF ledger_entries FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE ledger_entries_2026_08 PARTITION OF ledger_entries FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE ledger_entries_2026_09 PARTITION OF ledger_entries FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

INSERT INTO ledger_entries SELECT * FROM ledger_entries_unpartitioned;
DROP TABLE ledger_entries_unpartitioned;

-- --- calls: PK (id) -> (id, started_at), PARTITION BY started_at ---------
ALTER TABLE calls RENAME TO calls_unpartitioned;
ALTER INDEX calls_pkey RENAME TO calls_unpartitioned_pkey;
ALTER INDEX calls_responsible_user_idx RENAME TO calls_unpartitioned_responsible_user_idx;
ALTER INDEX calls_tenant_id_provider_external_call_id_key RENAME TO calls_unpartitioned_tenant_id_provider_external_call_id_key;

CREATE TABLE calls (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    provider TEXT NOT NULL,
    external_call_id TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    from_number TEXT NOT NULL,
    to_number TEXT NOT NULL,
    responsible_user_id UUID REFERENCES users(id),
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    recording_object_key TEXT,
    status TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id, started_at),
    UNIQUE (tenant_id, provider, external_call_id, started_at)
) PARTITION BY RANGE (started_at);

ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON calls
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX calls_responsible_user_idx ON calls (tenant_id, responsible_user_id, started_at);

CREATE TABLE calls_default PARTITION OF calls DEFAULT;
CREATE TABLE calls_2026_06 PARTITION OF calls FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE calls_2026_07 PARTITION OF calls FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE calls_2026_08 PARTITION OF calls FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE calls_2026_09 PARTITION OF calls FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

INSERT INTO calls SELECT * FROM calls_unpartitioned;
DROP TABLE calls_unpartitioned;

-- --- webhook_events: PK (id) -> (id, created_at), PARTITION BY created_at ---
-- No idempotency constraint recreated here -- see webhook_event_dedup above.
ALTER TABLE webhook_events RENAME TO webhook_events_unpartitioned;
ALTER INDEX webhook_events_pkey RENAME TO webhook_events_unpartitioned_pkey;
ALTER INDEX webhook_events_tenant_id_provider_external_event_id_key RENAME TO webhook_events_unpartitioned_tenant_id_provider_external_event_id_key;

CREATE TABLE webhook_events (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    provider TEXT NOT NULL,
    external_event_id TEXT NOT NULL,
    raw_payload JSONB NOT NULL,
    signature_valid BOOLEAN NOT NULL,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON webhook_events
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TABLE webhook_events_default PARTITION OF webhook_events DEFAULT;
CREATE TABLE webhook_events_2026_06 PARTITION OF webhook_events FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE webhook_events_2026_07 PARTITION OF webhook_events FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE webhook_events_2026_08 PARTITION OF webhook_events FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE webhook_events_2026_09 PARTITION OF webhook_events FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

INSERT INTO webhook_events SELECT * FROM webhook_events_unpartitioned;
DROP TABLE webhook_events_unpartitioned;

-- --- audit_logs: add the same DEFAULT-partition safety net (Faza 2 never
-- had one; cheap to add now, prevents insert failures once real time moves
-- past the hand-created 2026-06..2026-09 range and before Faza 14 lands). ---
CREATE TABLE audit_logs_default PARTITION OF audit_logs DEFAULT;
