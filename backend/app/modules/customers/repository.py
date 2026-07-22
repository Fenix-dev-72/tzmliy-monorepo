from pathlib import Path
from uuid import UUID

import aiosql
import asyncpg

_queries = aiosql.from_path(
    Path(__file__).parent / "sql" / "queries.sql", "asyncpg", mandatory_parameters=False
)


def _row(record: asyncpg.Record | None) -> dict | None:
    return dict(record) if record is not None else None


async def insert_customer(
    conn: asyncpg.Connection,
    tenant_id: UUID,
    full_name: str,
    phone: str | None,
    responsible_user_id: UUID | None,
    stage: str,
    source: str | None = None,
    created_by_user_id: UUID | None = None,
) -> dict | None:
    row = await _queries.insert_customer(
        conn,
        tenant_id=tenant_id,
        full_name=full_name,
        phone=phone,
        responsible_user_id=responsible_user_id,
        stage=stage,
        source=source,
        created_by_user_id=created_by_user_id,
    )
    return _row(row)


async def get_customer_by_id(conn: asyncpg.Connection, customer_id: UUID) -> dict | None:
    row = await _queries.get_customer_by_id(conn, customer_id=customer_id)
    return _row(row)


async def get_customer_by_phone(conn: asyncpg.Connection, phone: str) -> dict | None:
    row = await _queries.get_customer_by_phone(conn, phone=phone)
    return _row(row)


async def list_customers(
    conn: asyncpg.Connection, limit: int, offset: int, caller_id: UUID, can_view_all: bool
) -> list[dict]:
    rows = [
        row
        async for row in _queries.list_customers(
            conn, limit=limit, offset=offset, caller_id=caller_id, can_view_all=can_view_all
        )
    ]
    return [dict(r) for r in rows]


async def update_customer(
    conn: asyncpg.Connection,
    customer_id: UUID,
    full_name: str,
    phone: str,
    responsible_user_id: UUID | None,
    stage: str,
) -> dict | None:
    row = await _queries.update_customer(
        conn,
        customer_id=customer_id,
        full_name=full_name,
        phone=phone,
        responsible_user_id=responsible_user_id,
        stage=stage,
    )
    return _row(row)


async def update_customer_crm_outcome(
    conn: asyncpg.Connection, customer_id: UUID, stage: str, quality: str, lost_reason: str | None
) -> None:
    await _queries.update_customer_crm_outcome(conn, customer_id=customer_id, stage=stage, quality=quality, lost_reason=lost_reason)


async def user_exists(conn: asyncpg.Connection, user_id: UUID) -> bool:
    row = await _queries.user_exists(conn, user_id=user_id)
    return row["exists"]


async def insert_customer_activity(
    conn: asyncpg.Connection,
    tenant_id: UUID,
    customer_id: UUID,
    actor_user_id: UUID,
    activity_type: str,
    note: str | None,
) -> dict:
    row = await _queries.insert_customer_activity(
        conn,
        tenant_id=tenant_id,
        customer_id=customer_id,
        actor_user_id=actor_user_id,
        activity_type=activity_type,
        note=note,
    )
    return _row(row)


async def list_customer_activities(conn: asyncpg.Connection, customer_id: UUID) -> list[dict]:
    rows = [row async for row in _queries.list_customer_activities(conn, customer_id=customer_id)]
    return [dict(r) for r in rows]
