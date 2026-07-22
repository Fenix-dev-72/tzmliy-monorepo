-- name: insert_dashboard^
INSERT INTO dashboards (tenant_id, name, password_hash)
VALUES (:tenant_id, :name, :password_hash)
ON CONFLICT (tenant_id, name) DO NOTHING
RETURNING id, tenant_id, name, created_at;

-- name: get_dashboard_by_name^
SELECT id, tenant_id, name, password_hash, failed_login_attempts, locked_until, created_at
FROM dashboards
WHERE name = :name;

-- name: record_dashboard_failed_login^
UPDATE dashboards
SET failed_login_attempts = failed_login_attempts + 1,
    locked_until = CASE
        WHEN failed_login_attempts + 1 >= :max_attempts
        THEN now() + make_interval(mins => :lockout_minutes)
        ELSE locked_until
    END
WHERE id = :dashboard_id
RETURNING failed_login_attempts, locked_until;

-- name: reset_dashboard_failed_logins!
UPDATE dashboards
SET failed_login_attempts = 0, locked_until = NULL
WHERE id = :dashboard_id AND (failed_login_attempts > 0 OR locked_until IS NOT NULL);

-- name: get_dashboard_by_id^
SELECT id, tenant_id, name, password_hash, created_at
FROM dashboards
WHERE id = :dashboard_id;

-- name: list_dashboards
SELECT id, tenant_id, name, created_at
FROM dashboards
ORDER BY created_at;

-- name: delete_dashboard!
DELETE FROM dashboards WHERE id = :dashboard_id;

-- name: get_leaderboard
-- Own-data scoping (2026-07-22): :can_view_all bypasses the filter entirely;
-- otherwise the caller only ever sees their own row (a "leaderboard" of one),
-- reusing sales.view_all as the gate since every row here is derived from
-- sales. COALESCE: prefer full_name (set via the user-profile self/admin
-- edit, 2026-07-13); phone-only registered users (self-registration, no
-- email required) have a NULL email -- fall back to phone so user_email
-- (typed non-nullable str in LeaderboardEntryOut) is never actually NULL.
SELECT s.responsible_user_id AS user_id, COALESCE(u.full_name, u.email, u.phone) AS user_email, s.currency AS currency,
       COUNT(*) AS sales_count, COALESCE(SUM(s.price_amount), 0)::bigint AS total_amount
FROM sales s
JOIN users u ON u.id = s.responsible_user_id
WHERE s.created_at >= :period_start AND s.created_at < :period_end
  AND (:can_view_all OR s.responsible_user_id = :caller_id)
GROUP BY s.responsible_user_id, u.full_name, u.email, u.phone, s.currency
ORDER BY total_amount DESC;

-- name: get_category_sales_summary
-- Own-data scoping (2026-07-22): see get_leaderboard above.
SELECT s.catalog_category_id AS category_id, cc.name AS category_name, s.currency AS currency,
       COUNT(*) AS sales_count, COALESCE(SUM(s.price_amount), 0)::bigint AS total_amount
FROM sales s
LEFT JOIN catalog_categories cc ON cc.id = s.catalog_category_id
WHERE s.created_at >= :period_start AND s.created_at < :period_end
  AND (:can_view_all OR s.responsible_user_id = :caller_id)
GROUP BY s.catalog_category_id, cc.name, s.currency
ORDER BY total_amount DESC;

-- name: get_sales_totals_by_currency
-- Own-data scoping (2026-07-22): see get_leaderboard above.
SELECT currency, COUNT(*) AS sales_count, COALESCE(SUM(price_amount), 0)::bigint AS total_amount
FROM sales
WHERE created_at >= :period_start AND created_at < :period_end
  AND (:can_view_all OR responsible_user_id = :caller_id)
GROUP BY currency;

-- name: get_collected_totals_by_currency
-- Own-data scoping (2026-07-22): sale_payments has no responsible_user_id of
-- its own, so this joins to the parent sale's -- same "my sales' financial
-- trail" rule finance/service.py uses for payments/ledger.
SELECT sp.currency AS currency, COALESCE(SUM(sp.amount), 0)::bigint AS total_amount
FROM sale_payments sp
JOIN sales s ON s.id = sp.sale_id
WHERE sp.created_at >= :period_start AND sp.created_at < :period_end
  AND (:can_view_all OR s.responsible_user_id = :caller_id)
GROUP BY sp.currency;

-- name: count_active_customers^
-- Own-data scoping (2026-07-22): reuses the same responsible_user_id/
-- created_by_user_id ownership rule as customers/service.py's list_customers.
SELECT COUNT(*) AS count FROM customers
WHERE stage != 'lost' AND (:can_view_all OR responsible_user_id = :caller_id OR created_by_user_id = :caller_id);

-- name: get_sales_timeseries_buckets
-- optimize.md #25 (2026-07-18): was fetching every raw (created_at, currency,
-- amount) row in the window and bucketing in Python -- for a busy tenant that
-- meant pulling every sale/payment of the last 24h/7d/30d over the wire just
-- to sum them. `AT TIME ZONE 'Asia/Tashkent'` converts the timestamptz into
-- this module's fixed local wall-clock convention (_TASHKENT_TZ) *before*
-- date_trunc, sidestepping the original concern (Postgres's session timezone
-- disagreeing with Asia/Tashkent) since the conversion is explicit, not
-- session-dependent. :unit is 'hour' (day period) or 'day' (week/month).
-- Own-data scoping (2026-07-22): see get_leaderboard above.
SELECT date_trunc(:unit, created_at AT TIME ZONE 'Asia/Tashkent') AS bucket_start,
       currency, COALESCE(SUM(price_amount), 0)::bigint AS amount
FROM sales
WHERE created_at >= :period_start AND created_at < :period_end
  AND (:can_view_all OR responsible_user_id = :caller_id)
GROUP BY bucket_start, currency;

-- name: get_collected_timeseries_buckets
-- Own-data scoping (2026-07-22): see get_collected_totals_by_currency above.
SELECT date_trunc(:unit, sp.created_at AT TIME ZONE 'Asia/Tashkent') AS bucket_start,
       sp.currency AS currency, COALESCE(SUM(sp.amount), 0)::bigint AS amount
FROM sale_payments sp
JOIN sales s ON s.id = sp.sale_id
WHERE sp.created_at >= :period_start AND sp.created_at < :period_end
  AND (:can_view_all OR s.responsible_user_id = :caller_id)
GROUP BY bucket_start, sp.currency;

-- name: get_outstanding_debt_by_currency
-- A sale's balance is SUM(ledger_entries.amount) (append-only ledger
-- convention) -- positive means the customer still owes money (the inverse
-- of reports/get_negative_balance_sales, which finds over-refunded/negative
-- balances). overdue_* additionally requires the sale's own deadline to have
-- passed and the sale to still be active (not cancelled/completed).
-- Own-data scoping (2026-07-22): see get_leaderboard above.
WITH balances AS (
    SELECT s.id AS sale_id, s.currency, s.deadline, s.status, SUM(le.amount) AS balance
    FROM sales s
    JOIN ledger_entries le ON le.sale_id = s.id
    WHERE (:can_view_all OR s.responsible_user_id = :caller_id)
    GROUP BY s.id, s.currency, s.deadline, s.status
    HAVING SUM(le.amount) > 0
)
SELECT currency,
       COALESCE(SUM(balance), 0)::bigint AS total_outstanding,
       COALESCE(SUM(balance) FILTER (WHERE deadline < now() AND status = 'active'), 0)::bigint AS overdue_amount,
       COUNT(*) FILTER (WHERE deadline < now() AND status = 'active') AS overdue_count
FROM balances
GROUP BY currency;

-- Per-seller KPI detail page (2026-07-13) -- all four queries below are
-- single, indexed, WHERE responsible_user_id = :user_id scoped lookups (no
-- N+1, no Python-side loop), scoped to one seller at a time since this
-- backs a per-seller detail page, not a batch leaderboard.

-- name: get_seller_leads_count^
SELECT COUNT(*) AS count
FROM customers
WHERE responsible_user_id = :user_id AND created_at >= :period_start AND created_at < :period_end;

-- name: get_seller_sales_count^
SELECT COUNT(*) AS count, COALESCE(SUM(price_amount) FILTER (WHERE currency = 'UZS'), 0)::bigint AS total_uzs,
       COALESCE(SUM(price_amount) FILTER (WHERE currency = 'USD'), 0)::bigint AS total_usd
FROM sales
WHERE responsible_user_id = :user_id AND created_at >= :period_start AND created_at < :period_end;

-- name: get_seller_debt_collection^
-- Among this seller's sales whose deadline falls in the selected period and
-- has already passed, what fraction had their ledger balance fully paid off
-- (SUM(amount) <= 0) as of that deadline specifically -- not "as of now".
SELECT
    COUNT(*) AS total_due,
    COUNT(*) FILTER (
        WHERE COALESCE(
            (SELECT SUM(le.amount) FROM ledger_entries le WHERE le.sale_id = s.id AND le.created_at <= s.deadline),
            0
        ) <= 0
    ) AS collected_on_time
FROM sales s
WHERE s.responsible_user_id = :user_id
  AND s.deadline >= :period_start AND s.deadline < :period_end
  AND s.deadline <= now();

-- name: get_seller_refund_rate^
SELECT
    COUNT(DISTINCT s.id) AS total_sales,
    COUNT(DISTINCT s.id) FILTER (WHERE r.id IS NOT NULL) AS sales_with_refund
FROM sales s
LEFT JOIN refunds r ON r.sale_id = s.id
WHERE s.responsible_user_id = :user_id
  AND s.created_at >= :period_start AND s.created_at < :period_end;

-- Seller KPI dashboard expansion (2026-07-15) -- five more per-seller
-- queries, same single-purpose/indexed/no-N+1 shape as the four above.
-- get_seller_kpis (service.py) fans all nine of these out with
-- asyncio.gather, each on its own tenant_connection (one asyncpg connection
-- can't run concurrent queries), mirroring reports/service.py's
-- get_diagnostics parallelization.

-- name: get_seller_sales_by_mode
-- "Sotuv - Onlayn/Oflayn/Intensiv": one CTE for this seller's sales in the
-- period, one for their payments, joined once -- not N+1 per sale.
-- delivery_mode is NULL for sales predating this column; surfaced as its own
-- bucket in the UI ("Aniqlanmagan"), not hidden or merged into another mode.
WITH seller_sales AS (
    SELECT id, delivery_mode, currency, price_amount
    FROM sales
    WHERE responsible_user_id = :user_id AND created_at >= :period_start AND created_at < :period_end
),
payments AS (
    SELECT sp.sale_id, SUM(sp.amount) AS collected
    FROM sale_payments sp
    JOIN seller_sales ss ON ss.id = sp.sale_id
    GROUP BY sp.sale_id
)
SELECT ss.delivery_mode, ss.currency,
       COUNT(*) AS sales_count,
       COALESCE(SUM(ss.price_amount), 0)::bigint AS agreed_amount,
       COALESCE(SUM(p.collected), 0)::bigint AS collected_amount
FROM seller_sales ss
LEFT JOIN payments p ON p.sale_id = ss.id
GROUP BY ss.delivery_mode, ss.currency;

-- name: get_seller_call_stats^
-- "Qo'ng'iroqlar va faollik". `status` is free-text per-provider (confirmed:
-- UtelProvider/MoiZvonkiProvider each pass through their own disposition/
-- result string, defaulting to the literal "unknown") -- not reliable across
-- providers, so duration_seconds = 0 is the cross-provider "didn't connect"
-- proxy for a missed call, not `status`. active_days backs "kunlik suhbat
-- vaqti" (service.py divides total_duration_seconds by this, guarding /0).
SELECT
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE direction = 'outbound') AS outbound,
    COUNT(*) FILTER (WHERE direction = 'inbound') AS inbound,
    COUNT(*) FILTER (WHERE duration_seconds = 0) AS missed,
    COALESCE(AVG(duration_seconds), 0)::float AS avg_duration_seconds,
    COALESCE(SUM(duration_seconds), 0)::bigint AS total_duration_seconds,
    COUNT(DISTINCT date_trunc('day', started_at)) AS active_days
FROM calls
WHERE responsible_user_id = :user_id AND started_at >= :period_start AND started_at < :period_end;

-- name: get_seller_crm_activity_stats^
-- "CRM faoliyat": Yozuvlar = every logged activity; Bosqich o'zgarishi =
-- activity_type='status_change', auto-logged by customers/service.py's
-- update_customer whenever a customer's stage changes.
SELECT
    COUNT(*) AS notes_count,
    COUNT(*) FILTER (WHERE activity_type = 'status_change') AS stage_changes_count
FROM crm_activities
WHERE actor_user_id = :user_id AND created_at >= :period_start AND created_at < :period_end;

-- name: get_seller_lead_funnel^
-- "Lid ko'rsatkichlari". active_count is a current snapshot (a state, not a
-- period event -- deliberately NOT period-filtered), won/lost are
-- period-bound on updated_at (when the stage last changed). quality/
-- low_quality counts (2026-07-15, seller/lead analytics) are only ever set
-- when a lead reaches a terminal CRM outcome (see crm/service.py's
-- ingest_webhook), so they're period-bound the same way won/lost are, not a
-- current snapshot.
SELECT
    COUNT(*) FILTER (WHERE stage IN ('lead', 'qualified')) AS active_count,
    COUNT(*) FILTER (WHERE stage = 'customer' AND updated_at >= :period_start AND updated_at < :period_end) AS won_count,
    COUNT(*) FILTER (WHERE stage = 'lost' AND updated_at >= :period_start AND updated_at < :period_end) AS lost_count,
    COUNT(*) FILTER (WHERE quality = 'quality' AND updated_at >= :period_start AND updated_at < :period_end) AS quality_count,
    COUNT(*) FILTER (WHERE quality = 'low_quality' AND updated_at >= :period_start AND updated_at < :period_end) AS low_quality_count
FROM customers
WHERE responsible_user_id = :user_id;

-- name: get_tenant_lead_quality_summary^
-- Tenant-wide counterpart to get_seller_lead_funnel above (client
-- requirement, 2026-07-15: "umumiy ishlarni adminga ko'rsatish") -- same
-- shape, just without the per-seller responsible_user_id filter. Own-data
-- scoping (2026-07-22): :can_view_all bypasses the added filter below,
-- reusing the same responsible_user_id/created_by_user_id ownership rule as
-- customers/service.py's list_customers.
SELECT
    COUNT(*) FILTER (WHERE created_at >= :period_start AND created_at < :period_end) AS received_count,
    COUNT(*) FILTER (WHERE stage IN ('lead', 'qualified')) AS active_count,
    COUNT(*) FILTER (WHERE stage = 'customer' AND updated_at >= :period_start AND updated_at < :period_end) AS won_count,
    COUNT(*) FILTER (WHERE stage = 'lost' AND updated_at >= :period_start AND updated_at < :period_end) AS lost_count,
    COUNT(*) FILTER (WHERE quality = 'quality' AND updated_at >= :period_start AND updated_at < :period_end) AS quality_count,
    COUNT(*) FILTER (WHERE quality = 'low_quality' AND updated_at >= :period_start AND updated_at < :period_end) AS low_quality_count
FROM customers
WHERE (:can_view_all OR responsible_user_id = :caller_id OR created_by_user_id = :caller_id);

-- name: get_seller_lead_response_time^
-- "Lid javob vaqti": median seconds between a customer's created_at and the
-- first crm_activities row logged against them (their first real touch) --
-- calls aren't usable here since the calls table has no customer_id FK (only
-- raw from_number/to_number), so crm_activities.customer_id is the only
-- reliable per-customer join available. percentile_cont needs no manual
-- sorting/Python-side percentile math. sample_count lets the caller suppress
-- a median computed from too few data points.
WITH targets AS (
    SELECT id, created_at
    FROM customers
    WHERE responsible_user_id = :user_id AND created_at >= :period_start AND created_at < :period_end
),
first_touch AS (
    SELECT t.id, t.created_at, MIN(a.created_at) AS first_touch_at
    FROM targets t
    LEFT JOIN crm_activities a ON a.customer_id = t.id
    GROUP BY t.id, t.created_at
)
SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (first_touch_at - created_at))) AS median_seconds,
       COUNT(*) FILTER (WHERE first_touch_at IS NOT NULL) AS sample_count
FROM first_touch;
