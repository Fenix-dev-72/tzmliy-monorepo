from pathlib import Path
from uuid import UUID

import aiosql
import asyncpg

_queries = aiosql.from_path(Path(__file__).parent / "sql" / "queries.sql", "asyncpg", mandatory_parameters=False)


def _rows(records: list[asyncpg.Record]) -> list[dict]:
    return [dict(r) for r in records]


def _row(record: asyncpg.Record | None) -> dict | None:
    return dict(record) if record is not None else None


async def get_sales_without_charge_entry(conn: asyncpg.Connection, period_start) -> list[dict]:
    rows = [row async for row in _queries.get_sales_without_charge_entry(conn, period_start=period_start)]
    return _rows(rows)


async def get_stale_pending_adjustment_requests(conn: asyncpg.Connection, stale_days: int) -> list[dict]:
    rows = [row async for row in _queries.get_stale_pending_adjustment_requests(conn, stale_days=stale_days)]
    return _rows(rows)


async def get_negative_balance_sales(conn: asyncpg.Connection, period_start) -> list[dict]:
    rows = [row async for row in _queries.get_negative_balance_sales(conn, period_start=period_start)]
    return _rows(rows)


async def get_webhook_events_backlog(conn: asyncpg.Connection) -> list[dict]:
    rows = [row async for row in _queries.get_webhook_events_backlog(conn)]
    return _rows(rows)


async def get_notification_outbox_backlog(conn: asyncpg.Connection) -> list[dict]:
    rows = [row async for row in _queries.get_notification_outbox_backlog(conn)]
    return _rows(rows)


async def export_customers(conn: asyncpg.Connection) -> list[dict]:
    rows = [row async for row in _queries.export_customers(conn)]
    return _rows(rows)


async def export_sales(conn: asyncpg.Connection) -> list[dict]:
    rows = [row async for row in _queries.export_sales(conn)]
    return _rows(rows)


async def export_ledger_entries(conn: asyncpg.Connection) -> list[dict]:
    rows = [row async for row in _queries.export_ledger_entries(conn)]
    return _rows(rows)


async def export_calls(conn: asyncpg.Connection) -> list[dict]:
    rows = [row async for row in _queries.export_calls(conn)]
    return _rows(rows)


async def insert_export_job(
    conn: asyncpg.Connection, tenant_id: UUID, entity: str, format: str, requested_by_user_id: UUID
) -> dict:
    row = await _queries.insert_export_job(
        conn, tenant_id=tenant_id, entity=entity, format=format, requested_by_user_id=requested_by_user_id
    )
    return _row(row)


async def get_export_job(conn: asyncpg.Connection, job_id: UUID) -> dict | None:
    row = await _queries.get_export_job(conn, job_id=job_id)
    return _row(row)


async def claim_pending_export_job(conn: asyncpg.Connection) -> dict | None:
    row = await _queries.claim_pending_export_job(conn)
    return _row(row)


async def mark_export_job_done(conn: asyncpg.Connection, job_id: UUID, file_object_key: str) -> None:
    await _queries.mark_export_job_done(conn, job_id=job_id, file_object_key=file_object_key)


async def mark_export_job_failed(conn: asyncpg.Connection, job_id: UUID, error: str) -> None:
    await _queries.mark_export_job_failed(conn, job_id=job_id, error=error)
