"""Row-Level-Security tenant-isolation tests — the security-critical invariant
the whole multi-tenant design rests on: one tenant can never see or write
another tenant's rows, enforced at the DB layer regardless of app-code bugs.

These drive the *real* `app.core.database.tenant_connection` helper against a
live Postgres, connecting as the NOBYPASSRLS `app_user` role, so a regression in
either the SQL policies or the `set_config('app.tenant_id', ...)` wiring fails
here. See tests/conftest.py for how the DB is located.
"""

import asyncpg
import pytest

from app.core.database import tenant_connection


async def test_read_isolation_hides_other_tenants_rows(app_pool, two_tenants):
    tenant_a, tenant_b = two_tenants

    # Create a customer under tenant A through the real tenant-scoped helper.
    async with tenant_connection(app_pool, tenant_a) as conn:
        customer_id = await conn.fetchval(
            "INSERT INTO customers (tenant_id, full_name) VALUES ($1, $2) RETURNING id", tenant_a, "Alice"
        )
        visible = await conn.fetch("SELECT id FROM customers WHERE id = $1", customer_id)
        assert len(visible) == 1, "tenant A must see its own row"

    # Tenant B must not see tenant A's row, even asking for it by primary key.
    async with tenant_connection(app_pool, tenant_b) as conn:
        leaked = await conn.fetch("SELECT id FROM customers WHERE id = $1", customer_id)
        assert leaked == [], "RLS must hide tenant A's row from tenant B"

    # And tenant A still sees it — isolation is symmetric, not a blanket deny.
    async with tenant_connection(app_pool, tenant_a) as conn:
        again = await conn.fetch("SELECT id FROM customers WHERE id = $1", customer_id)
        assert len(again) == 1


async def test_write_check_rejects_foreign_tenant_id(app_pool, two_tenants):
    tenant_a, tenant_b = two_tenants

    # With app.tenant_id = A, inserting a row stamped tenant_id = B must be
    # rejected by the policy's WITH CHECK clause, not silently written.
    with pytest.raises(asyncpg.PostgresError):
        async with tenant_connection(app_pool, tenant_a) as conn:
            await conn.execute(
                "INSERT INTO customers (tenant_id, full_name) VALUES ($1, $2)", tenant_b, "Mallory"
            )

    # Nothing was written under B.
    async with tenant_connection(app_pool, tenant_b) as conn:
        count = await conn.fetchval("SELECT count(*) FROM customers WHERE full_name = $1", "Mallory")
        assert count == 0


async def test_missing_tenant_context_is_default_deny(app_pool, fresh_app_conn, two_tenants):
    tenant_a, _ = two_tenants
    async with tenant_connection(app_pool, tenant_a) as conn:
        await conn.execute("INSERT INTO customers (tenant_id, full_name) VALUES ($1, $2)", tenant_a, "Alice")

    # A fresh app_user connection that never set app.tenant_id must see zero
    # rows: current_setting('app.tenant_id', true) is NULL when unset, so the
    # policy filters every row out (default-deny). NB: this only holds for a
    # truly unset GUC — a pooled connection where a prior LOCAL set_config left
    # it as an empty string would instead error on ''::uuid, which is why the
    # app only ever reads RLS tables through tenant_connection, never a bare one.
    count = await fresh_app_conn.fetchval("SELECT count(*) FROM customers WHERE tenant_id = $1", tenant_a)
    assert count == 0, "no tenant context must expose no rows"


async def test_isolation_generalizes_beyond_customers(app_pool, two_tenants):
    # Prove the invariant isn't accidentally shaped around one table: repeat it
    # on `roles`, a structurally different tenant-scoped table.
    tenant_a, tenant_b = two_tenants
    async with tenant_connection(app_pool, tenant_a) as conn:
        role_id = await conn.fetchval(
            "INSERT INTO roles (tenant_id, name) VALUES ($1, $2) RETURNING id", tenant_a, "custom-role"
        )

    async with tenant_connection(app_pool, tenant_b) as conn:
        leaked = await conn.fetch("SELECT id FROM roles WHERE id = $1", role_id)
        assert leaked == [], "RLS must isolate roles across tenants too"
