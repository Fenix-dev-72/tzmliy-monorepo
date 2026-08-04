-- Index every column the paginated list/count queries actually filter or
-- sort on (client request 2026-07-28, "qidiruv va filterlarni hammasiga
-- indexlash ishlat, bo'lmasa query og'irlashib ketadi") -- covers the gaps
-- the earlier 0026 performance-indexes pass (sales/sale_payments/
-- ledger_entries) and calls' own responsible_user_idx didn't reach.

-- customers: list_customers/count_customers OR together responsible_user_id
-- and created_by_user_id (own-data scoping) -- only the first half had an
-- index. ORDER BY created_at had none at all. stage is the Customers page's
-- filter-tab column, same pattern as sales_status_idx below.
CREATE INDEX customers_created_by_user_idx ON customers (tenant_id, created_by_user_id);
CREATE INDEX customers_created_at_idx ON customers (tenant_id, created_at);
CREATE INDEX customers_stage_idx ON customers (tenant_id, stage);

-- calls: status is the Calls page's filter-tab column -- responsible_user_idx
-- already covers ownership+ORDER BY started_at, this covers the other axis.
-- Partitioned table -- CREATE INDEX here creates a matching index on every
-- existing partition automatically (same as calls_responsible_user_idx did
-- in 0019_infra_partitioning.sql) and is inherited by future partitions too.
CREATE INDEX calls_status_idx ON calls (tenant_id, status, started_at);

-- users: had ZERO tenant-scoped index before this -- every list_users call
-- (RLS-filtered by tenant_id, ORDER BY created_at) was a sequential scan.
-- is_active backs UsersPage's inactive-sorted-to-bottom behavior, the
-- natural next server-side filter for this list.
CREATE INDEX users_created_at_idx ON users (tenant_id, created_at);
CREATE INDEX users_is_active_idx ON users (tenant_id, is_active);
