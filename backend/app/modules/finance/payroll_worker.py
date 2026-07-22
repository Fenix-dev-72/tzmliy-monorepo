"""Background payroll-calculation loop -- same shape as
app/modules/notifications/worker.py's outbox delivery loop: one dedicated
table (payroll_calculation_jobs), one asyncio.create_task, started/cancelled
in main.py's lifespan. Moves the actual (now-batched) calculation off the
request-handling event loop so a large tenant's payroll run never blocks
another tenant's requests or holds an HTTP connection open for its duration.
"""

import logging
import asyncio

import asyncpg

from app.core.config import Settings
from app.core.database import platform_connection, tenant_connection
from app.modules.finance import repository
from app.modules.finance.service import _run_payroll_calculation
from app.modules.tenants import repository as tenants_repository

logger = logging.getLogger("dashboarduz.finance.payroll_worker")


async def _process_job(pool: asyncpg.Pool, job: dict) -> None:
    # Claiming (status flipped 'pending'->'processing') already happened
    # atomically in claim_pending_payroll_job -- no separate mark-processing
    # step needed here.
    tenant_id = job["tenant_id"]
    error: str | None = None
    try:
        async with tenant_connection(pool, tenant_id) as conn:
            await _run_payroll_calculation(
                conn,
                tenant_id,
                job["requested_by_user_id"],
                job["period_start"],
                job["period_end"],
                job["user_id"],
            )
    except Exception as exc:  # a bad job must not stop the others
        error = str(exc)

    async with tenant_connection(pool, tenant_id) as conn:
        if error is None:
            await repository.mark_payroll_job_done(conn, job["id"])
        else:
            await repository.mark_payroll_job_failed(conn, job["id"], error)


async def process_pending_jobs(pool: asyncpg.Pool) -> None:
    async with platform_connection(pool) as conn:
        all_tenants = await tenants_repository.list_tenants(conn)

    for tenant in all_tenants:
        while True:
            async with tenant_connection(pool, tenant["id"]) as conn:
                job = await repository.claim_pending_payroll_job(conn)
            if job is None:
                break
            await _process_job(pool, job)


async def run_forever(pool: asyncpg.Pool, settings: Settings) -> None:
    logger.info("payroll worker starting, poll interval=%ss", settings.finance_payroll_worker_poll_seconds)
    while True:
        try:
            await process_pending_jobs(pool)
        except Exception:
            logger.exception("payroll worker tick failed")
        await asyncio.sleep(settings.finance_payroll_worker_poll_seconds)
