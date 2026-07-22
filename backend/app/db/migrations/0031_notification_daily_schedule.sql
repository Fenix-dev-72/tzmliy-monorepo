-- Daily seller-sales-summary auto-broadcast (client requirement, 2026-07-13):
-- admin sets a time of day; every day at that time, a per-seller "who sold
-- how much today" text message is sent to the tenant's default Telegram
-- group automatically -- no manual "send report" click needed each day.
--
-- One row per tenant (UNIQUE(tenant_id)) -- the client asked for "a specific
-- time" (singular), not a per-category schedule, so this deliberately does
-- NOT mirror telegram_group_mappings' category-scoped shape.
CREATE TABLE notification_daily_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id),
    send_time TIME NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    -- Tracks which calendar day (Asia/Tashkent) this schedule last fired for,
    -- so a worker polling every 30s doesn't resend the same day's report on
    -- every tick once send_time has passed.
    last_sent_date DATE,
    created_by_user_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE notification_daily_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_daily_schedules FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notification_daily_schedules
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
