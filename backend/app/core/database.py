from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import UUID

import asyncpg

from app.core.config import Settings


def _pool_kwargs(settings: Settings) -> dict:
    # Scaling-prep (2026-07-18): statement_cache_size is only passed at all
    # when explicitly set -- omitting the kwarg entirely (rather than
    # guessing asyncpg's internal default) leaves asyncpg's own default
    # prepared-statement cache behavior completely untouched today. Only
    # meaningful once DATABASE_URL points at PgBouncer in transaction-
    # pooling mode -- see config.py's db_statement_cache_size docstring.
    kwargs: dict = {"min_size": settings.db_pool_min_size, "max_size": settings.db_pool_max_size}
    if settings.db_statement_cache_size is not None:
        kwargs["statement_cache_size"] = settings.db_statement_cache_size
    return kwargs


async def create_pool(settings: Settings) -> asyncpg.Pool:
    return await asyncpg.create_pool(dsn=settings.database_url, **_pool_kwargs(settings))


async def create_replica_pool(settings: Settings, primary_pool: asyncpg.Pool) -> asyncpg.Pool:
    """Scaling-prep (2026-07-18): returns a second pool pointed at
    replica_database_url, or -- while that setting is unset, i.e. today --
    the exact same primary_pool object. read_tenant_connection below always
    goes through whatever this returns, so it's a genuine no-op until a real
    replica DSN is configured, not a separate code path that needs testing
    against a real replica to trust."""
    if not settings.replica_database_url:
        return primary_pool
    return await asyncpg.create_pool(dsn=settings.replica_database_url, **_pool_kwargs(settings))


@asynccontextmanager
async def tenant_connection(pool: asyncpg.Pool, tenant_id: UUID) -> AsyncIterator[asyncpg.Connection]:
    """Acquire a connection scoped to one tenant for a single transaction.

    RLS policies read current_setting('app.tenant_id'), set below via
    set_config(..., true) so it never leaks outside this transaction. Callers
    must pass a tenant_id resolved from the authenticated session — never a
    client-supplied header — or tenant isolation is worthless.
    """
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("SELECT set_config('app.tenant_id', $1, true)", str(tenant_id))
            yield conn


@asynccontextmanager
async def platform_connection(pool: asyncpg.Pool) -> AsyncIterator[asyncpg.Connection]:
    """Connection for /platform routes, which read platform-level tables
    that carry no tenant_id and are never subject to tenant RLS policies."""
    async with pool.acquire() as conn:
        yield conn


@asynccontextmanager
async def read_tenant_connection(replica_pool: asyncpg.Pool, tenant_id: UUID) -> AsyncIterator[asyncpg.Connection]:
    """Scaling-prep (2026-07-18): read-only counterpart to tenant_connection,
    for report/analytics endpoints that never write. A deliberately separate
    function (not tenant_connection with a pool swapped in) -- retry/failover
    behavior for a lagging or momentarily-unreachable replica belongs here
    eventually, and shouldn't get tangled into the primary write path's own
    logic. Until replica_database_url is configured, replica_pool *is* the
    primary pool (see create_replica_pool above), so this behaves identically
    to tenant_connection today."""
    async with replica_pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("SELECT set_config('app.tenant_id', $1, true)", str(tenant_id))
            yield conn
