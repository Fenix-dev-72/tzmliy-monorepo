-- Replaces the single-schedule-per-tenant notification_daily_schedules with
-- a proper one-to-many table: a tenant can now run several independently
-- configured recurring Telegram sends (own group, time, days-of-week,
-- targeting, and message content each), not just one fixed daily digest.
-- Clean-break replace, not an ALTER -- no real tenant data exists yet on the
-- staging VPS (see backend/CLAUDE.md's Deployment section), so a backfill +
-- drop is safe and cheaper than maintaining both shapes.
CREATE TABLE notification_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    label TEXT NOT NULL DEFAULT '',
    send_time TIME NOT NULL,
    -- NULL = every day; otherwise 0=Mon..6=Sun, same "NULL means everyone/
    -- everything" convention as user_ids/role_ids below.
    days_of_week SMALLINT[],
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    -- Which already-connected group to target -- NULL falls back to the
    -- tenant's default (no-category) group mapping, same resolution as every
    -- other send in this module.
    group_mapping_id UUID REFERENCES telegram_group_mappings(id),
    -- What the message body contains: an auto-generated team leaderboard, an
    -- auto-generated single-seller KPI digest, or fixed admin-authored text.
    content_type TEXT NOT NULL DEFAULT 'leaderboard'
        CHECK (content_type IN ('leaderboard', 'seller_kpis', 'custom_text')),
    period TEXT NOT NULL DEFAULT 'today' CHECK (period IN ('today', 'week', 'month')),
    custom_text TEXT,
    CHECK ((content_type = 'custom_text') = (custom_text IS NOT NULL)),
    -- Which sellers/managers' sales to include -- NULL means everyone.
    user_ids UUID[],
    -- Whole-role targeting, OR'd with user_ids, not ANDed: a user is included
    -- if they're in user_ids OR hold one of these roles.
    role_ids UUID[],
    -- Tracks which calendar day (Asia/Tashkent) this schedule last fired for,
    -- so a beat tick every ~60s doesn't resend the same day's message once
    -- send_time has passed.
    last_sent_date DATE,
    created_by_user_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE notification_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_schedules FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notification_schedules
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX notification_schedules_due_idx ON notification_schedules (tenant_id, is_enabled, send_time);

INSERT INTO notification_schedules (
    tenant_id, send_time, is_enabled, group_mapping_id, user_ids, role_ids,
    last_sent_date, created_by_user_id, created_at, updated_at
)
SELECT tenant_id, send_time, is_enabled, group_mapping_id, user_ids, role_ids,
       last_sent_date, created_by_user_id, created_at, updated_at
FROM notification_daily_schedules;

DROP TABLE notification_daily_schedules;
