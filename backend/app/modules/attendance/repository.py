from datetime import datetime
from pathlib import Path
from uuid import UUID

import aiosql
import asyncpg

_queries = aiosql.from_path(
    Path(__file__).parent / "sql" / "queries.sql", "asyncpg", mandatory_parameters=False
)


def _row(record: asyncpg.Record | None) -> dict | None:
    return dict(record) if record is not None else None


async def insert_check_in(
    conn: asyncpg.Connection, tenant_id: UUID, user_id: UUID, check_in_at: datetime | None, source: str
) -> dict:
    row = await _queries.insert_check_in(
        conn, tenant_id=tenant_id, user_id=user_id, check_in_at=check_in_at, source=source
    )
    return _row(row)


async def check_out(conn: asyncpg.Connection, user_id: UUID) -> dict | None:
    row = await _queries.check_out(conn, user_id=user_id)
    return _row(row)


async def list_attendance(conn: asyncpg.Connection, user_id: UUID | None) -> list[dict]:
    rows = [row async for row in _queries.list_attendance(conn, user_id=user_id)]
    return [dict(r) for r in rows]


async def user_exists(conn: asyncpg.Connection, user_id: UUID) -> bool:
    row = await _queries.user_exists(conn, user_id=user_id)
    return row["exists"]
