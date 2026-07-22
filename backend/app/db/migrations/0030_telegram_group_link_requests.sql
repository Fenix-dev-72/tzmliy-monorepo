-- "Add bot to group" self-service linking (client requirement, 2026-07-13):
-- admin clicks a button, Telegram's own `?startgroup=<token>` deep link lets
-- them pick a group to add the bot to, and the bot receives that token back
-- as a `/start <token>` message *inside* the newly-joined group -- so the
-- chat_id is auto-discovered, never typed in by hand (Telegram never shows
-- a group's chat_id in its UI at all).
--
-- Not folded into telegram_group_mappings itself (that table's
-- telegram_chat_id is NOT NULL, and a pending request has no chat_id yet) --
-- same "small side table, not a nullable column on the real table" shape as
-- users.telegram_link_token_hash uses for personal linking, matching the
-- existing user_login_identifiers / webhook_event_dedup convention of using
-- a dedicated lookup table to sidestep a constraint problem.
CREATE TABLE telegram_group_link_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    token_hash TEXT NOT NULL,
    category_id UUID REFERENCES catalog_categories(id),
    label TEXT NOT NULL,
    requested_by_user_id UUID NOT NULL REFERENCES users(id),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE telegram_group_link_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_group_link_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON telegram_group_link_requests
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX telegram_group_link_requests_token_idx ON telegram_group_link_requests (tenant_id, token_hash);
