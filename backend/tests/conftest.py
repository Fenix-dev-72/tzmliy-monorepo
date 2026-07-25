"""Shared pytest fixtures for the integration suite.

These tests exercise the real Postgres RLS policies, so they need a live,
migrated database with the app's two roles (`app_user` = NOBYPASSRLS,
`dashboarduz_owner` = owner). The local docker-compose Postgres is that DB:

    docker compose up -d postgres
    python -m app.db.migrate   # if not already applied

Connection DSNs default to the docker-exposed Postgres on localhost:5432. They
are built the same way `docker-compose.yml` builds the container's own DSNs — from
the `APP_DB_PASSWORD` / `POSTGRES_OWNER_*` / `POSTGRES_DB` vars in `backend/.env`,
NOT from the literal `DATABASE_URL` / `MIGRATIONS_DATABASE_URL` lines (those point
at a native 5433 instance and can carry a stale password). Override any of
TEST_DATABASE_URL / TEST_MIGRATIONS_DATABASE_URL / TEST_PG_PORT if your setup differs.

If Postgres isn't reachable, the DB-dependent tests skip (not fail) with a hint.
"""

import os
import socket
import uuid
from urllib.parse import urlsplit

import asyncpg
import bcrypt
import pytest
import pytest_asyncio
import redis.asyncio as aioredis
from httpx import ASGITransport, AsyncClient

_ENV_PATH = os.path.join(os.path.dirname(__file__), "..", ".env")


def _read_env(key: str, default: str) -> str:
    try:
        with open(_ENV_PATH, encoding="utf-8") as fh:
            for line in fh:
                if line.startswith(key + "="):
                    return line.split("=", 1)[1].strip()
    except FileNotFoundError:
        pass
    return default


_PORT = os.environ.get("TEST_PG_PORT", "5432")
_DB = _read_env("POSTGRES_DB", "dashboarduz")
_APP_PASSWORD = _read_env("APP_DB_PASSWORD", "app_user_dev_password")
_OWNER_USER = _read_env("POSTGRES_OWNER_USER", "dashboarduz_owner")
_OWNER_PASSWORD = _read_env("POSTGRES_OWNER_PASSWORD", "owner_dev_password")

APP_DSN = os.environ.get("TEST_DATABASE_URL") or (
    f"postgresql://app_user:{_APP_PASSWORD}@localhost:{_PORT}/{_DB}"
)
OWNER_DSN = os.environ.get("TEST_MIGRATIONS_DATABASE_URL") or (
    f"postgresql://{_OWNER_USER}:{_OWNER_PASSWORD}@localhost:{_PORT}/{_DB}"
)


@pytest.fixture(scope="session")
def _require_db() -> None:
    parts = urlsplit(APP_DSN)
    sock = socket.socket()
    sock.settimeout(2)
    try:
        sock.connect((parts.hostname or "localhost", int(parts.port or 5432)))
    except OSError:
        pytest.skip(
            f"Postgres not reachable at {parts.hostname}:{parts.port} — start it with "
            "`docker compose up -d postgres` (see tests/conftest.py)",
            allow_module_level=False,
        )
    finally:
        sock.close()


@pytest_asyncio.fixture
async def app_pool(_require_db):
    """asyncpg pool connected as `app_user` (NOBYPASSRLS) — RLS policies apply,
    exactly as they do for the running app."""
    pool = await asyncpg.create_pool(dsn=APP_DSN, min_size=1, max_size=4)
    try:
        yield pool
    finally:
        await pool.close()


@pytest_asyncio.fixture
async def fresh_app_conn(_require_db):
    """A brand-new `app_user` connection that has never set app.tenant_id, so
    the GUC is genuinely unset (NULL) rather than left as an empty string by a
    prior LOCAL set_config on a pooled connection. Needed to test the true
    default-deny path."""
    conn = await asyncpg.connect(APP_DSN)
    try:
        yield conn
    finally:
        await conn.close()


@pytest_asyncio.fixture
async def owner_conn(_require_db):
    """Connection as the owner role (bypasses RLS) — used only to set up and
    tear down platform-level fixture data (tenants), never as the thing under
    test."""
    conn = await asyncpg.connect(OWNER_DSN)
    try:
        yield conn
    finally:
        await conn.close()


@pytest_asyncio.fixture
async def two_tenants(owner_conn):
    """Create two throwaway tenants and clean them (plus any dependent rows the
    tests created) up afterwards. Yields (tenant_a_id, tenant_b_id)."""
    suffix = uuid.uuid4().hex[:8]
    tenant_a = await owner_conn.fetchval(
        "INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id", "RLS Test A", f"rls-test-a-{suffix}"
    )
    tenant_b = await owner_conn.fetchval(
        "INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id", "RLS Test B", f"rls-test-b-{suffix}"
    )
    try:
        yield tenant_a, tenant_b
    finally:
        ids = [tenant_a, tenant_b]
        # Order matters for FKs: job tables and users reference tenants (and
        # users), so clear dependents before roles/tenants.
        await owner_conn.execute("DELETE FROM payroll_calculation_jobs WHERE tenant_id = ANY($1::uuid[])", ids)
        await owner_conn.execute("DELETE FROM report_export_jobs WHERE tenant_id = ANY($1::uuid[])", ids)
        await owner_conn.execute("DELETE FROM notification_outbox WHERE tenant_id = ANY($1::uuid[])", ids)
        await owner_conn.execute("DELETE FROM sales WHERE tenant_id = ANY($1::uuid[])", ids)
        await owner_conn.execute("DELETE FROM products WHERE tenant_id = ANY($1::uuid[])", ids)
        await owner_conn.execute("DELETE FROM catalog_categories WHERE tenant_id = ANY($1::uuid[])", ids)
        await owner_conn.execute("DELETE FROM attendance WHERE tenant_id = ANY($1::uuid[])", ids)
        await owner_conn.execute("DELETE FROM customers WHERE tenant_id = ANY($1::uuid[])", ids)
        await owner_conn.execute(
            "DELETE FROM refresh_sessions WHERE user_id IN (SELECT id FROM users WHERE tenant_id = ANY($1::uuid[]))",
            ids,
        )
        await owner_conn.execute("DELETE FROM user_login_identifiers WHERE tenant_id = ANY($1::uuid[])", ids)
        await owner_conn.execute("DELETE FROM users WHERE tenant_id = ANY($1::uuid[])", ids)
        await owner_conn.execute("DELETE FROM roles WHERE tenant_id = ANY($1::uuid[])", ids)
        await owner_conn.execute("DELETE FROM tenants WHERE id = ANY($1::uuid[])", ids)


@pytest_asyncio.fixture
async def tenant_users(owner_conn, two_tenants):
    """Seed one minimal user (with its own role) per tenant, returning
    {tenant_id: user_id}. For tests that need a valid users FK (e.g. a job's
    requested_by_user_id). Cleaned up by two_tenants' teardown."""
    users: dict = {}
    for tenant_id in two_tenants:
        role_id = await owner_conn.fetchval(
            "INSERT INTO roles (tenant_id, name) VALUES ($1, $2) RETURNING id", tenant_id, "test-role"
        )
        users[tenant_id] = await owner_conn.fetchval(
            "INSERT INTO users (tenant_id, email, password_hash, role_id) VALUES ($1, $2, $3, $4) RETURNING id",
            tenant_id,
            f"test-{uuid.uuid4().hex}@example.test",  # users CHECK requires email or phone
            "not-a-real-hash",
            role_id,
        )
    return users


@pytest_asyncio.fixture
async def api_client(app_pool):
    """httpx client bound to the real FastAPI app over ASGITransport. app.state
    (pool/replica_pool/redis) is wired manually to the docker services rather
    than running the full lifespan, so the background workers don't start. The
    rate-limit Redis DB is flushed each test so per-IP buckets don't carry over."""
    from app.main import app as fastapi_app

    redis_client = aioredis.Redis(
        host="localhost", port=int(os.environ.get("TEST_REDIS_PORT", "6379")), db=8
    )
    await redis_client.flushdb()
    fastapi_app.state.pool = app_pool
    fastapi_app.state.replica_pool = app_pool
    fastapi_app.state.redis = redis_client
    transport = ASGITransport(app=fastapi_app)
    try:
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            yield client
    finally:
        await redis_client.aclose()


@pytest_asyncio.fixture
async def http_user(owner_conn, two_tenants):
    """A fully login-capable user under tenant A: real bcrypt password hash plus
    the user_login_identifiers row that identifier-based login resolves through.
    Returns {identifier, password, tenant_id, user_id}. Cleaned up by
    two_tenants' teardown."""
    tenant_a, _ = two_tenants
    password = "Sup3rSecret!"
    pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    identifier = f"httptest-{uuid.uuid4().hex}@example.com"  # already lowercase (login normalizes to lower)
    role_id = await owner_conn.fetchval(
        "INSERT INTO roles (tenant_id, name) VALUES ($1, $2) RETURNING id", tenant_a, "http-test-role"
    )
    user_id = await owner_conn.fetchval(
        "INSERT INTO users (tenant_id, email, password_hash, role_id) VALUES ($1, $2, $3, $4) RETURNING id",
        tenant_a,
        identifier,
        pw_hash,
        role_id,
    )
    await owner_conn.execute(
        "INSERT INTO user_login_identifiers (identifier, identifier_type, tenant_id, user_id) "
        "VALUES ($1, 'email', $2, $3)",
        identifier,
        tenant_a,
        user_id,
    )
    return {"identifier": identifier, "password": password, "tenant_id": tenant_a, "user_id": user_id}
