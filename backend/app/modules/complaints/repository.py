from pathlib import Path
from uuid import UUID

import aiosql
import asyncpg

_queries = aiosql.from_path(Path(__file__).parent / "sql" / "queries.sql", "asyncpg", mandatory_parameters=False)


def _row(record: asyncpg.Record | None) -> dict | None:
    return dict(record) if record is not None else None


async def insert_complaint(
    conn: asyncpg.Connection, tenant_id: UUID, created_by_user_id: UUID, subject: str, message: str
) -> dict:
    row = await _queries.insert_complaint(
        conn, tenant_id=tenant_id, created_by_user_id=created_by_user_id, subject=subject, message=message
    )
    return _row(row)


async def list_complaints(conn: asyncpg.Connection, status: str | None) -> list[dict]:
    rows = [row async for row in _queries.list_complaints(conn, status=status)]
    return [dict(r) for r in rows]


async def get_complaint_by_id(conn: asyncpg.Connection, complaint_id: UUID) -> dict | None:
    row = await _queries.get_complaint_by_id(conn, complaint_id=complaint_id)
    return _row(row)


async def update_complaint_status(
    conn: asyncpg.Connection, complaint_id: UUID, new_status: str, admin_id: UUID
) -> dict | None:
    row = await _queries.update_complaint_status(
        conn, complaint_id=complaint_id, new_status=new_status, admin_id=admin_id
    )
    return _row(row)
