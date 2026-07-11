from pathlib import Path

import aiosql
import asyncpg

_queries = aiosql.from_path(Path(__file__).parent / "sql" / "queries.sql", "asyncpg", mandatory_parameters=False)


def _rows(records: list[asyncpg.Record]) -> list[dict]:
    return [dict(r) for r in records]


async def get_sales_without_charge_entry(conn: asyncpg.Connection) -> list[dict]:
    rows = [row async for row in _queries.get_sales_without_charge_entry(conn)]
    return _rows(rows)


async def get_stale_pending_adjustment_requests(conn: asyncpg.Connection, stale_days: int) -> list[dict]:
    rows = [row async for row in _queries.get_stale_pending_adjustment_requests(conn, stale_days=stale_days)]
    return _rows(rows)


async def get_negative_balance_sales(conn: asyncpg.Connection) -> list[dict]:
    rows = [row async for row in _queries.get_negative_balance_sales(conn)]
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
