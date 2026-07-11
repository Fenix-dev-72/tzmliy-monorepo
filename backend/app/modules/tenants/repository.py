from datetime import datetime
from pathlib import Path
from uuid import UUID

import aiosql
import asyncpg

_queries = aiosql.from_path(
    Path(__file__).parent / "sql" / "queries.sql", "asyncpg", mandatory_parameters=False
)


def _row(record: asyncpg.Record | None) -> dict | None:
    """aiosql/asyncpg return Record objects, which Pydantic can't validate via
    getattr — repository functions hand back plain dicts so nothing above
    this layer needs to know about asyncpg."""
    return dict(record) if record is not None else None


def _rows(records: list[asyncpg.Record]) -> list[dict]:
    return [dict(r) for r in records]


async def get_platform_admin_by_email(conn: asyncpg.Connection, email: str) -> dict | None:
    row = await _queries.get_platform_admin_by_email(conn, email=email)
    return _row(row)


async def get_platform_admin_by_id(conn: asyncpg.Connection, admin_id: UUID) -> dict | None:
    row = await _queries.get_platform_admin_by_id(conn, admin_id=admin_id)
    return _row(row)


async def record_platform_admin_failed_login(
    conn: asyncpg.Connection, admin_id: UUID, max_attempts: int, lockout_minutes: int
) -> dict:
    row = await _queries.record_platform_admin_failed_login(
        conn, admin_id=admin_id, max_attempts=max_attempts, lockout_minutes=lockout_minutes
    )
    return _row(row)


async def reset_platform_admin_failed_logins(conn: asyncpg.Connection, admin_id: UUID) -> None:
    await _queries.reset_platform_admin_failed_logins(conn, admin_id=admin_id)


async def set_platform_admin_totp_secret(conn: asyncpg.Connection, admin_id: UUID, totp_secret: str) -> None:
    await _queries.set_platform_admin_totp_secret(conn, admin_id=admin_id, totp_secret=totp_secret)


async def enable_platform_admin_totp(conn: asyncpg.Connection, admin_id: UUID) -> None:
    await _queries.enable_platform_admin_totp(conn, admin_id=admin_id)


async def insert_tenant(conn: asyncpg.Connection, name: str, slug: str) -> dict | None:
    row = await _queries.insert_tenant(conn, name=name, slug=slug)
    return _row(row)


async def list_tenants(conn: asyncpg.Connection) -> list[dict]:
    # aiosql's asyncpg adapter returns an async generator for "select many"
    # queries (no ^/$/! suffix), not an awaitable list.
    rows = [row async for row in _queries.list_tenants(conn)]
    return _rows(rows)


async def get_tenant_by_id(conn: asyncpg.Connection, tenant_id: UUID) -> dict | None:
    row = await _queries.get_tenant_by_id(conn, tenant_id=tenant_id)
    return _row(row)


async def get_tenant_by_slug(conn: asyncpg.Connection, slug: str) -> dict | None:
    row = await _queries.get_tenant_by_slug(conn, slug=slug)
    return _row(row)


async def update_tenant_status(conn: asyncpg.Connection, tenant_id: UUID, new_status: str) -> dict | None:
    row = await _queries.update_tenant_status(conn, tenant_id=tenant_id, new_status=new_status)
    return _row(row)


async def insert_platform_admin_session(
    conn: asyncpg.Connection, session_id: UUID, admin_id: UUID, token_hash: str, expires_at: datetime
) -> dict:
    row = await _queries.insert_platform_admin_session(
        conn, id=session_id, admin_id=admin_id, token_hash=token_hash, expires_at=expires_at
    )
    return _row(row)


async def get_active_platform_admin_session(conn: asyncpg.Connection, session_id: UUID, admin_id: UUID) -> dict | None:
    row = await _queries.get_active_platform_admin_session(conn, session_id=session_id, admin_id=admin_id)
    return _row(row)


async def revoke_platform_admin_session(conn: asyncpg.Connection, session_id: UUID) -> None:
    await _queries.revoke_platform_admin_session(conn, session_id=session_id)


async def insert_audit_log(
    conn: asyncpg.Connection, actor_type: str, actor_id: UUID, tenant_id: UUID | None, action: str, reason: str
) -> dict:
    row = await _queries.insert_audit_log(
        conn, actor_type=actor_type, actor_id=actor_id, tenant_id=tenant_id, action=action, reason=reason
    )
    return _row(row)


async def list_audit_logs(conn: asyncpg.Connection) -> list[dict]:
    rows = [row async for row in _queries.list_audit_logs(conn)]
    return _rows(rows)
