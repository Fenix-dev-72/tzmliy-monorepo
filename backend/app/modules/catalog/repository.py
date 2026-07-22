from pathlib import Path
from uuid import UUID

import aiosql
import asyncpg

_queries = aiosql.from_path(
    Path(__file__).parent / "sql" / "queries.sql", "asyncpg", mandatory_parameters=False
)


def _row(record: asyncpg.Record | None) -> dict | None:
    return dict(record) if record is not None else None


async def insert_category(conn: asyncpg.Connection, tenant_id: UUID, parent_id: UUID | None, name: str) -> dict:
    row = await _queries.insert_category(conn, tenant_id=tenant_id, parent_id=parent_id, name=name)
    return _row(row)


async def get_category_by_id(conn: asyncpg.Connection, category_id: UUID) -> dict | None:
    row = await _queries.get_category_by_id(conn, category_id=category_id)
    return _row(row)


async def list_categories(conn: asyncpg.Connection) -> list[dict]:
    rows = [row async for row in _queries.list_categories(conn)]
    return [dict(r) for r in rows]


async def count_children(conn: asyncpg.Connection, category_id: UUID) -> int:
    row = await _queries.count_children(conn, category_id=category_id)
    return row["n"]


async def update_category(conn: asyncpg.Connection, category_id: UUID, name: str) -> None:
    await _queries.update_category(conn, category_id=category_id, name=name)


async def delete_category(conn: asyncpg.Connection, category_id: UUID) -> None:
    await _queries.delete_category(conn, category_id=category_id)
