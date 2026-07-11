from datetime import datetime
from pathlib import Path
from uuid import UUID

import aiosql
import asyncpg

_queries = aiosql.from_path(Path(__file__).parent / "sql" / "queries.sql", "asyncpg", mandatory_parameters=False)


def _row(record: asyncpg.Record | None) -> dict | None:
    return dict(record) if record is not None else None


def _rows(records: list[asyncpg.Record]) -> list[dict]:
    return [dict(r) for r in records]


async def upsert_group_mapping_for_category(
    conn: asyncpg.Connection, tenant_id: UUID, category_id: UUID, telegram_chat_id: int, label: str
) -> dict:
    row = await _queries.upsert_group_mapping_for_category(
        conn, tenant_id=tenant_id, category_id=category_id, telegram_chat_id=telegram_chat_id, label=label
    )
    return _row(row)


async def upsert_default_group_mapping(
    conn: asyncpg.Connection, tenant_id: UUID, telegram_chat_id: int, label: str
) -> dict:
    row = await _queries.upsert_default_group_mapping(
        conn, tenant_id=tenant_id, telegram_chat_id=telegram_chat_id, label=label
    )
    return _row(row)


async def list_group_mappings(conn: asyncpg.Connection) -> list[dict]:
    rows = [row async for row in _queries.list_group_mappings(conn)]
    return _rows(rows)


async def get_group_mapping_by_category(conn: asyncpg.Connection, category_id: UUID) -> dict | None:
    row = await _queries.get_group_mapping_by_category(conn, category_id=category_id)
    return _row(row)


async def get_default_group_mapping(conn: asyncpg.Connection) -> dict | None:
    row = await _queries.get_default_group_mapping(conn)
    return _row(row)


async def enqueue_message(
    conn: asyncpg.Connection,
    tenant_id: UUID,
    telegram_chat_id: int,
    text_body: str,
    category_id: UUID | None,
    created_by_user_id: UUID | None,
) -> dict:
    row = await _queries.enqueue_message(
        conn,
        tenant_id=tenant_id,
        telegram_chat_id=telegram_chat_id,
        text_body=text_body,
        category_id=category_id,
        created_by_user_id=created_by_user_id,
    )
    return _row(row)


async def enqueue_document(
    conn: asyncpg.Connection,
    tenant_id: UUID,
    telegram_chat_id: int,
    document_object_key: str,
    document_filename: str,
    category_id: UUID | None,
    created_by_user_id: UUID | None,
) -> dict:
    row = await _queries.enqueue_document(
        conn,
        tenant_id=tenant_id,
        telegram_chat_id=telegram_chat_id,
        document_object_key=document_object_key,
        document_filename=document_filename,
        category_id=category_id,
        created_by_user_id=created_by_user_id,
    )
    return _row(row)


async def list_outbox_for_tenant(conn: asyncpg.Connection) -> list[dict]:
    rows = [row async for row in _queries.list_outbox_for_tenant(conn)]
    return _rows(rows)


async def list_due_outbox_messages(conn: asyncpg.Connection, now: datetime) -> list[dict]:
    rows = [row async for row in _queries.list_due_outbox_messages(conn, now=now)]
    return _rows(rows)


async def mark_outbox_sent(conn: asyncpg.Connection, outbox_id: UUID) -> dict | None:
    row = await _queries.mark_outbox_sent(conn, id=outbox_id)
    return _row(row)


async def mark_outbox_retry_or_dead_letter(
    conn: asyncpg.Connection, outbox_id: UUID, last_error: str, next_attempt_at: datetime
) -> dict | None:
    row = await _queries.mark_outbox_retry_or_dead_letter(
        conn, id=outbox_id, last_error=last_error, next_attempt_at=next_attempt_at
    )
    return _row(row)


async def insert_delivery_log(
    conn: asyncpg.Connection, tenant_id: UUID, outbox_id: UUID, attempt_number: int, status: str, error: str | None
) -> dict:
    row = await _queries.insert_delivery_log(
        conn, tenant_id=tenant_id, outbox_id=outbox_id, attempt_number=attempt_number, status=status, error=error
    )
    return _row(row)


async def list_delivery_log(conn: asyncpg.Connection, outbox_id: UUID | None) -> list[dict]:
    rows = [row async for row in _queries.list_delivery_log(conn, outbox_id=outbox_id)]
    return _rows(rows)


async def get_sales_summary_rows(
    conn: asyncpg.Connection, period_start: datetime, period_end: datetime, category_id: UUID | None
) -> list[dict]:
    rows = [
        row
        async for row in _queries.get_sales_summary_rows(
            conn, period_start=period_start, period_end=period_end, category_id=category_id
        )
    ]
    return _rows(rows)
