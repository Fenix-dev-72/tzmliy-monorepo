-- Performance hardening pass (2026-07-12): missing indexes that were
-- silently degrading date-ranged queries (profit summary, analytics
-- leaderboard/category-sales, reports diagnostics) as tables grow. See the
-- Faza 13 performance section in CLAUDE.md for context.

-- sales had no index on created_at at all (0008_sales.sql only indexed
-- customer_id/responsible_user_id/status/catalog_category_id) -- every
-- date-ranged query against it (profit summary, leaderboard, category
-- sales, "sales without charge" diagnostic) was a full sequential scan.
CREATE INDEX sales_created_at_idx ON sales (tenant_id, created_at);

-- Supports the batched payroll query's date-range filter on
-- sale_payments.created_at (only sale_id was indexed before).
CREATE INDEX sale_payments_created_at_idx ON sale_payments (tenant_id, created_at);

-- Lets the reports diagnostics' negative-balance check
-- (GROUP BY sale_id, currency HAVING SUM(amount) < 0, currently a full scan
-- of every ledger_entries partition since it has no date predicate to prune
-- on) do an index-only aggregate instead of a heap scan. CREATE INDEX on
-- the partitioned parent auto-propagates to every existing partition, same
-- mechanic as the table's other indexes in 0019_infra_partitioning.sql.
CREATE INDEX ledger_entries_sale_currency_idx ON ledger_entries (tenant_id, sale_id, currency);
