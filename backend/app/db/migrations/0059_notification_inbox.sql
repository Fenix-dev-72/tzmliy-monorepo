-- In-app notification inbox (2026-08-10): the bell icon in the dashboard
-- header was previously a stub link with no real data behind it. This is
-- the per-user delivery target for three sources: complaint replies
-- (complaints.reply_to_complaint), Platform Admin broadcasts
-- (notifications.broadcast), and the automatic payment-due warning
-- (billing.send_payment_due_warnings_daily). Tenant-scoped, RLS -- same
-- FORCE RLS + tenant_isolation shape as notification_outbox
-- (0014_notifications.sql).
CREATE TABLE user_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    user_id UUID NOT NULL REFERENCES users(id),
    type TEXT NOT NULL CHECK (type IN ('support_reply', 'broadcast', 'payment_due')),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    link TEXT,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON user_notifications
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Bell dropdown's two queries: unread-count (WHERE user_id = ... AND NOT
-- is_read) and the recent-list (WHERE user_id = ... ORDER BY created_at DESC).
CREATE INDEX user_notifications_unread_idx ON user_notifications (tenant_id, user_id, is_read);
CREATE INDEX user_notifications_recent_idx ON user_notifications (tenant_id, user_id, created_at DESC);

-- complaints reply: Platform Admin can now attach an actual response, not
-- just flip status. Keeps the write-only-from-Platform-Admin,
-- no-RLS/cross-tenant shape of the rest of the table (0049_complaints.sql).
ALTER TABLE complaints ADD COLUMN admin_reply TEXT;
ALTER TABLE complaints ADD COLUMN replied_by_admin_id UUID REFERENCES platform_admins(id);
ALTER TABLE complaints ADD COLUMN replied_at TIMESTAMPTZ;

-- Payment-due warning (billing/tasks.py): tracks whether the current
-- billing period's "2 days left" warning has already fired, same pattern
-- as warning_80_sent_at/warning_100_sent_at (0013_billing.sql).
ALTER TABLE tenant_subscriptions ADD COLUMN payment_due_warning_sent_at TIMESTAMPTZ;
