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
-- COALESCE: phone-only registered users (self-registration, no email
-- required) have a NULL email -- fall back to phone so user_email (typed
-- non-nullable str in LeaderboardEntryOut) is never actually NULL.
SELECT s.responsible_user_id AS user_id, COALESCE(u.email, u.phone) AS user_email, s.currency AS currency,
       COUNT(*) AS sales_count, COALESCE(SUM(s.price_amount), 0)::bigint AS total_amount
FROM sales s
JOIN users u ON u.id = s.responsible_user_id
WHERE s.created_at >= :period_start AND s.created_at < :period_end
GROUP BY s.responsible_user_id, u.email, u.phone, s.currency
ORDER BY total_amount DESC;

-- name: get_category_sales_summary
SELECT s.catalog_category_id AS category_id, cc.name AS category_name, s.currency AS currency,
       COUNT(*) AS sales_count, COALESCE(SUM(s.price_amount), 0)::bigint AS total_amount
FROM sales s
LEFT JOIN catalog_categories cc ON cc.id = s.catalog_category_id
WHERE s.created_at >= :period_start AND s.created_at < :period_end
GROUP BY s.catalog_category_id, cc.name, s.currency
ORDER BY total_amount DESC;

-- name: get_sales_totals_by_currency
SELECT currency, COUNT(*) AS sales_count, COALESCE(SUM(price_amount), 0)::bigint AS total_amount
FROM sales
WHERE created_at >= :period_start AND created_at < :period_end
GROUP BY currency;

-- name: get_collected_totals_by_currency
SELECT currency, COALESCE(SUM(amount), 0)::bigint AS total_amount
FROM sale_payments
WHERE created_at >= :period_start AND created_at < :period_end
GROUP BY currency;

-- name: count_active_customers^
SELECT COUNT(*) AS count FROM customers WHERE stage != 'lost';
