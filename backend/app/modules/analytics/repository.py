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


async def insert_dashboard(conn: asyncpg.Connection, tenant_id: UUID, name: str, password_hash: str) -> dict | None:
    row = await _queries.insert_dashboard(conn, tenant_id=tenant_id, name=name, password_hash=password_hash)
    return _row(row)


async def get_dashboard_by_name(conn: asyncpg.Connection, name: str) -> dict | None:
    row = await _queries.get_dashboard_by_name(conn, name=name)
    return _row(row)


async def record_dashboard_failed_login(
    conn: asyncpg.Connection, dashboard_id: UUID, max_attempts: int, lockout_minutes: int
) -> dict | None:
    row = await _queries.record_dashboard_failed_login(
        conn, dashboard_id=dashboard_id, max_attempts=max_attempts, lockout_minutes=lockout_minutes
    )
    return _row(row)


async def reset_dashboard_failed_logins(conn: asyncpg.Connection, dashboard_id: UUID) -> None:
    await _queries.reset_dashboard_failed_logins(conn, dashboard_id=dashboard_id)


async def get_dashboard_by_id(conn: asyncpg.Connection, dashboard_id: UUID) -> dict | None:
    row = await _queries.get_dashboard_by_id(conn, dashboard_id=dashboard_id)
    return _row(row)


async def list_dashboards(conn: asyncpg.Connection) -> list[dict]:
    rows = [row async for row in _queries.list_dashboards(conn)]
    return _rows(rows)


async def delete_dashboard(conn: asyncpg.Connection, dashboard_id: UUID) -> None:
    await _queries.delete_dashboard(conn, dashboard_id=dashboard_id)


async def get_leaderboard(conn: asyncpg.Connection, period_start: datetime, period_end: datetime) -> list[dict]:
    rows = [row async for row in _queries.get_leaderboard(conn, period_start=period_start, period_end=period_end)]
    return _rows(rows)


async def get_category_sales_summary(conn: asyncpg.Connection, period_start: datetime, period_end: datetime) -> list[dict]:
    rows = [
        row
        async for row in _queries.get_category_sales_summary(conn, period_start=period_start, period_end=period_end)
    ]
    return _rows(rows)


async def get_sales_totals_by_currency(conn: asyncpg.Connection, period_start: datetime, period_end: datetime) -> list[dict]:
    rows = [
        row
        async for row in _queries.get_sales_totals_by_currency(conn, period_start=period_start, period_end=period_end)
    ]
    return _rows(rows)


async def get_collected_totals_by_currency(
    conn: asyncpg.Connection, period_start: datetime, period_end: datetime
) -> list[dict]:
    rows = [
        row
        async for row in _queries.get_collected_totals_by_currency(
            conn, period_start=period_start, period_end=period_end
        )
    ]
    return _rows(rows)


async def count_active_customers(conn: asyncpg.Connection) -> int:
    row = await _queries.count_active_customers(conn)
    return row["count"]
