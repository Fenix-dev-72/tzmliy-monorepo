from pathlib import Path
from uuid import UUID

import aiosql
import asyncpg

_queries = aiosql.from_path(Path(__file__).parent / "sql" / "inbox_queries.sql", "asyncpg", mandatory_parameters=False)


def _row(record: asyncpg.Record | None) -> dict | None:
    return dict(record) if record is not None else None


def _rows(records: list[asyncpg.Record]) -> list[dict]:
    return [dict(r) for r in records]


async def insert_notification(
    conn: asyncpg.Connection, tenant_id: UUID, user_id: UUID, type: str, title: str, body: str, link: str | None
) -> dict:
    row = await _queries.insert_notification(
        conn, tenant_id=tenant_id, user_id=user_id, type=type, title=title, body=body, link=link
    )
    return _row(row)


async def insert_notifications_bulk(
    conn: asyncpg.Connection,
    tenant_id: UUID,
    user_ids: list[UUID],
    type: str,
    title: str,
    body: str,
    link: str | None,
) -> None:
    if not user_ids:
        return
    await _queries.insert_notifications_bulk(
        conn, tenant_id=tenant_id, user_ids=user_ids, type=type, title=title, body=body, link=link
    )


async def list_inbox(conn: asyncpg.Connection, user_id: UUID, limit: int) -> list[dict]:
    rows = [row async for row in _queries.list_inbox(conn, user_id=user_id, limit=limit)]
    return _rows(rows)


async def count_unread(conn: asyncpg.Connection, user_id: UUID) -> int:
    row = await _queries.count_unread(conn, user_id=user_id)
    return row["count"]


async def mark_read(conn: asyncpg.Connection, notification_id: UUID, user_id: UUID) -> None:
    await _queries.mark_read(conn, notification_id=notification_id, user_id=user_id)


async def mark_all_read(conn: asyncpg.Connection, user_id: UUID) -> None:
    await _queries.mark_all_read(conn, user_id=user_id)
