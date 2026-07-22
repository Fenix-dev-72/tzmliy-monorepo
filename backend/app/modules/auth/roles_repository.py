from pathlib import Path
from uuid import UUID

import aiosql
import asyncpg

_queries = aiosql.from_path(
    Path(__file__).parent / "sql" / "roles.sql", "asyncpg", mandatory_parameters=False
)


def _row(record: asyncpg.Record | None) -> dict | None:
    return dict(record) if record is not None else None


async def insert_role(conn: asyncpg.Connection, tenant_id: UUID, name: str, is_system: bool) -> dict | None:
    row = await _queries.insert_role(conn, tenant_id=tenant_id, name=name, is_system=is_system)
    return _row(row)


async def get_role_by_name(conn: asyncpg.Connection, tenant_id: UUID, name: str) -> dict | None:
    row = await _queries.get_role_by_name(conn, tenant_id=tenant_id, name=name)
    return _row(row)


async def get_role_by_id(conn: asyncpg.Connection, role_id: UUID) -> dict | None:
    row = await _queries.get_role_by_id(conn, role_id=role_id)
    return _row(row)


async def list_roles(conn: asyncpg.Connection) -> list[dict]:
    rows = [row async for row in _queries.list_roles(conn)]
    return [dict(r) for r in rows]


async def insert_role_permission(conn: asyncpg.Connection, role_id: UUID, tenant_id: UUID, permission_key: str) -> None:
    await _queries.insert_role_permission(conn, role_id=role_id, tenant_id=tenant_id, permission_key=permission_key)


async def delete_role_permissions(conn: asyncpg.Connection, role_id: UUID) -> None:
    await _queries.delete_role_permissions(conn, role_id=role_id)


async def list_role_permission_keys(conn: asyncpg.Connection, role_id: UUID) -> list[str]:
    rows = [row async for row in _queries.list_role_permission_keys(conn, role_id=role_id)]
    return [row["permission_key"] for row in rows]


async def list_role_permission_keys_bulk(conn: asyncpg.Connection, role_ids: list[UUID]) -> dict[UUID, list[str]]:
    rows = [row async for row in _queries.list_role_permission_keys_bulk(conn, role_ids=role_ids)]
    result: dict[UUID, list[str]] = {role_id: [] for role_id in role_ids}
    for row in rows:
        result[row["role_id"]].append(row["permission_key"])
    return result
