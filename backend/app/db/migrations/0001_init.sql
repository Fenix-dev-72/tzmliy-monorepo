-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Least-privilege runtime role. RLS is ALWAYS bypassed for table owners and
-- superusers, so the FastAPI app must connect as this role, never as the
-- migration owner, or every tenant isolation policy below is a no-op.
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
        CREATE ROLE app_user LOGIN NOBYPASSRLS PASSWORD '{{APP_DB_PASSWORD}}';
    END IF;
END
$$;

DO $$
BEGIN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO app_user', current_database());
END
$$;

GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- So tables created by later migrations (run as the owner) are automatically
-- usable by app_user without a manual GRANT in every migration.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user;

-- Convention for every future tenant-scoped table (users, sales, calls, ...):
--
--   ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE <table> FORCE ROW LEVEL SECURITY;
--   CREATE POLICY tenant_isolation ON <table>
--       USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
--       WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
--
-- No default-allow policy is ever added: a session with no app.tenant_id set,
-- or a mismatched one, sees zero rows. This is enforced in
-- app/core/database.py's tenant_connection() helper.

-- Platform-level registries: no tenant_id, no RLS. Only reachable through
-- /platform routes, which authorize at the HTTP layer, not via tenant RLS.
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'trial'
        CHECK (status IN ('trial', 'active', 'past_due', 'grace', 'suspended', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE platform_admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
