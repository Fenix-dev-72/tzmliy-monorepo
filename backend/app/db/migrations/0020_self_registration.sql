-- Self-service tenant registration: a tenant no longer has to be manually
-- provisioned by a Platform Admin (that path -- POST /platform/v1/tenants +
-- .../admin-user -- still exists as a support/enterprise-onboarding tool,
-- just isn't the primary path anymore). Login also drops the tenant_slug
-- requirement: a user identifies themselves by email OR phone alone,
-- globally unique across every tenant, and the server resolves which
-- tenant they belong to.

-- --- Global uniqueness: email/phone now identify a user across ALL tenants,
-- not just within one. Postgres enforces uniqueness at the index level
-- regardless of RLS, so this is a real, race-safe global constraint even
-- though the users table stays RLS-scoped for normal reads/writes. ---
ALTER TABLE users DROP CONSTRAINT users_tenant_id_email_key;
ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
CREATE UNIQUE INDEX users_phone_key ON users (phone) WHERE phone IS NOT NULL;

-- --- user_login_identifiers: platform-level (no RLS, no tenant_id scoping
-- on the query side), the ONLY way to resolve "which tenant does this
-- email/phone belong to" before a tenant-scoped connection can even be
-- opened -- users itself carries FORCE ROW LEVEL SECURITY, so it can't be
-- queried without already knowing app.tenant_id. Same "small lookup table
-- sidesteps an RLS/architecture constraint" shape as webhook_event_dedup
-- (Faza 13) and subscription_payment_provider_refs (Faza 8). Kept in sync
-- with `users` by auth/repository.py's insert_user, in the same
-- transaction -- never written to independently. ---
CREATE TABLE user_login_identifiers (
    identifier TEXT PRIMARY KEY,
    identifier_type TEXT NOT NULL CHECK (identifier_type IN ('email', 'phone')),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    user_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Backfill for every user that existed before this migration.
INSERT INTO user_login_identifiers (identifier, identifier_type, tenant_id, user_id)
SELECT email, 'email', tenant_id, id FROM users;

INSERT INTO user_login_identifiers (identifier, identifier_type, tenant_id, user_id)
SELECT phone, 'phone', tenant_id, id FROM users WHERE phone IS NOT NULL;

-- --- registration_verifications: platform-level (no tenant exists yet at
-- this point in the flow, so there's nothing to RLS-scope to). Mirrors
-- otp_codes' shape (code_hash, attempt_count, expires_at, consumed_at) but
-- keyed by a bare identifier instead of a user_id. ---
CREATE TABLE registration_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier TEXT NOT NULL,
    identifier_type TEXT NOT NULL CHECK (identifier_type IN ('email', 'phone')),
    code_hash TEXT NOT NULL,
    attempt_count INT NOT NULL DEFAULT 0,
    consumed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX registration_verifications_identifier_idx ON registration_verifications (identifier, created_at DESC);

-- --- Trial period: every tenant (self-registered or Platform-Admin-
-- provisioned) gets a 15-day trial_ends_at by default. billing/service.py's
-- run_dunning is extended to suspend 'trial' tenants whose trial_ends_at
-- has passed without a paid subscription -- NULL means "no automatic
-- expiry" (an escape hatch for Platform-Admin-provisioned tenants that
-- shouldn't auto-suspend; existing rows get NULL via this migration, since
-- backfilling a 15-day clock onto tenants that predate this feature would
-- suspend them immediately). ---
ALTER TABLE tenants ADD COLUMN trial_ends_at TIMESTAMPTZ DEFAULT (now() + interval '15 days');
UPDATE tenants SET trial_ends_at = NULL;
