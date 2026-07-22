import asyncio
from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import UUID

import asyncpg

from app.core.database import read_tenant_connection, tenant_connection
from app.core import storage
from app.modules.reports import export_writers, repository

DEFAULT_STALE_ADJUSTMENT_DAYS = 3
# get_negative_balance_sales scans ledger_entries (partitioned, potentially
# many months) -- default to a recent window instead of the full history on
# every diagnostics call; callers can still pass an explicit, older
# period_start to see further back (or the full history with an old enough date).
DEFAULT_DIAGNOSTICS_LOOKBACK_DAYS = 90

ExportEntity = Literal["customers", "sales", "finance", "calls"]
ExportFormat = Literal["csv", "xlsx"]

_EXPORT_FETCHERS = {
    "customers": repository.export_customers,
    "sales": repository.export_sales,
    "finance": repository.export_ledger_entries,
    "calls": repository.export_calls,
}

_EXPORT_COLUMNS = {
    "customers": export_writers.CUSTOMERS_COLUMNS,
    "sales": export_writers.SALES_COLUMNS,
    "finance": export_writers.FINANCE_COLUMNS,
    "calls": export_writers.CALLS_COLUMNS,
}

_MEDIA_TYPES = {"csv": "text/csv", "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}


class ExportJobNotFoundError(Exception):
    pass


async def get_diagnostics(
    replica_pool: asyncpg.Pool,
    tenant_id: UUID,
    stale_days: int = DEFAULT_STALE_ADJUSTMENT_DAYS,
    period_start: datetime | None = None,
) -> dict:
    """Runs the five diagnostic checks concurrently, each on its own pool
    connection (asyncpg connections handle one query at a time -- sharing a
    single tenant_connection across an asyncio.gather() here would raise
    "another operation is in progress", not actually run them in parallel).
    period_start defaults to a recent lookback window for the negative-balance
    check (see DEFAULT_DIAGNOSTICS_LOOKBACK_DAYS); pass an explicit, older
    date for a longer or full-history window.

    Scaling-prep (2026-07-18): read-only, so it goes through
    read_tenant_connection/replica_pool -- identical behavior to today until
    replica_database_url is actually configured (see core/database.py)."""
    effective_period_start = period_start or (datetime.now(timezone.utc) - timedelta(days=DEFAULT_DIAGNOSTICS_LOOKBACK_DAYS))

    async def _sales_without_charge_entry() -> list[dict]:
        async with read_tenant_connection(replica_pool, tenant_id) as conn:
            return await repository.get_sales_without_charge_entry(conn, effective_period_start)

    async def _stale_pending_adjustment_requests() -> list[dict]:
        async with read_tenant_connection(replica_pool, tenant_id) as conn:
            return await repository.get_stale_pending_adjustment_requests(conn, stale_days)

    async def _negative_balance_sales() -> list[dict]:
        async with read_tenant_connection(replica_pool, tenant_id) as conn:
            return await repository.get_negative_balance_sales(conn, effective_period_start)

    async def _webhook_events_backlog() -> list[dict]:
        async with read_tenant_connection(replica_pool, tenant_id) as conn:
            return await repository.get_webhook_events_backlog(conn)

    async def _notification_outbox_backlog() -> list[dict]:
        async with read_tenant_connection(replica_pool, tenant_id) as conn:
            return await repository.get_notification_outbox_backlog(conn)

    (
        sales_without_charge_entry,
        stale_pending_adjustment_requests,
        negative_balance_sales,
        webhook_events_backlog,
        notification_outbox_backlog,
    ) = await asyncio.gather(
        _sales_without_charge_entry(),
        _stale_pending_adjustment_requests(),
        _negative_balance_sales(),
        _webhook_events_backlog(),
        _notification_outbox_backlog(),
    )

    return {
        "generated_at": datetime.now(timezone.utc),
        "sales_without_charge_entry": sales_without_charge_entry,
        "stale_pending_adjustment_requests": stale_pending_adjustment_requests,
        "negative_balance_sales": negative_balance_sales,
        "webhook_events_backlog": webhook_events_backlog,
        "notification_outbox_backlog": notification_outbox_backlog,
    }


def _export_object_key(tenant_id: UUID, job_id: UUID, entity: str, format: str) -> str:
    return f"exports/{tenant_id}/{job_id}-{entity}.{format}"


async def _run_export(conn: asyncpg.Connection, tenant_id: UUID, job_id: UUID, entity: str, format: str) -> str:
    """Batched core: fetch + build the file bytes, upload, return the object
    key. Runs off the request-handling event loop (export_worker.py) --
    openpyxl workbook construction is CPU-bound and was previously done
    synchronously inside the GET request, stalling every other tenant's
    requests on this single-worker deployment for large exports."""
    fetch = _EXPORT_FETCHERS[entity]
    rows = await fetch(conn)
    columns = _EXPORT_COLUMNS[entity]
    content = export_writers.rows_to_csv(rows, columns) if format == "csv" else export_writers.rows_to_xlsx(rows, columns)
    object_key = _export_object_key(tenant_id, job_id, entity, format)
    await storage.put_object(object_key, content, content_type=_MEDIA_TYPES[format])
    return object_key


async def enqueue_export(
    pool: asyncpg.Pool, tenant_id: UUID, entity: ExportEntity, format: ExportFormat, actor_user_id: UUID
) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.insert_export_job(conn, tenant_id, entity, format, actor_user_id)


async def get_export_job(pool: asyncpg.Pool, tenant_id: UUID, job_id: UUID) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        job = await repository.get_export_job(conn, job_id)
        if job is None:
            raise ExportJobNotFoundError
        if job["status"] == "done" and job["file_object_key"]:
            job["download_url"] = await storage.presigned_get_url(job["file_object_key"])
    return job
