"""Background report-export loop -- same shape as
app/modules/finance/payroll_worker.py and app/modules/notifications/worker.py:
one dedicated table (report_export_jobs), one asyncio.create_task, started/
cancelled in main.py's lifespan. Moves the CPU-bound CSV/XLSX generation off
the request-handling event loop so a large export never blocks another
tenant's requests or holds an HTTP connection open for its duration.
"""

import asyncio
import logging

import asyncpg

from app.core.config import Settings
from app.core.database import platform_connection, tenant_connection
from app.modules.reports import repository
from app.modules.reports.service import _run_export
from app.modules.tenants import repository as tenants_repository

logger = logging.getLogger("dashboarduz.reports.export_worker")


async def _process_job(pool: asyncpg.Pool, job: dict) -> None:
    # Claiming already happened atomically in claim_pending_export_job.
    tenant_id = job["tenant_id"]
    error: str | None = None
    object_key: str | None = None
    try:
        async with tenant_connection(pool, tenant_id) as conn:
            object_key = await _run_export(conn, tenant_id, job["id"], job["entity"], job["format"])
    except Exception as exc:  # a bad job must not stop the others
        error = str(exc)

    async with tenant_connection(pool, tenant_id) as conn:
        if error is None:
            await repository.mark_export_job_done(conn, job["id"], object_key)
        else:
            await repository.mark_export_job_failed(conn, job["id"], error)


async def process_pending_jobs(pool: asyncpg.Pool) -> None:
    async with platform_connection(pool) as conn:
        all_tenants = await tenants_repository.list_tenants(conn)

    for tenant in all_tenants:
        while True:
            async with tenant_connection(pool, tenant["id"]) as conn:
                job = await repository.claim_pending_export_job(conn)
            if job is None:
                break
            await _process_job(pool, job)


async def run_forever(pool: asyncpg.Pool, settings: Settings) -> None:
    logger.info("report export worker starting, poll interval=%ss", settings.reports_export_worker_poll_seconds)
    while True:
        try:
            await process_pending_jobs(pool)
        except Exception:
            logger.exception("report export worker tick failed")
        await asyncio.sleep(settings.reports_export_worker_poll_seconds)
