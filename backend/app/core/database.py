from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import UUID

import asyncpg

from app.core.config import Settings


async def create_pool(settings: Settings) -> asyncpg.Pool:
    return await asyncpg.create_pool(
        dsn=settings.database_url,
        min_size=settings.db_pool_min_size,
        max_size=settings.db_pool_max_size,
    )


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
