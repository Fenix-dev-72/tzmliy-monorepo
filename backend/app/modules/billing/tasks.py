"""Celery task for the daily storage-usage recalculation (2026-08-09) --
backs enforce_storage_not_exceeded's blocking check (billing/service.py),
which only ever reads the latest snapshot, never recomputes it inline.

Reuses notifications/tasks.py's run_async/get_pool, same convention as
backups/tasks.py.
"""

import asyncio

from app.core.celery_app import celery_app
from app.core.config import get_settings
from app.core.database import platform_connection
from app.modules.notifications.tasks import get_pool, run_async
from app.modules.tenants import repository as tenants_repository

from . import service


async def _recalculate_all_tenants_storage() -> None:
    pool = get_pool()
    settings = get_settings()
    async with platform_connection(pool) as conn:
        tenants = await tenants_repository.list_tenants(conn)

    semaphore = asyncio.Semaphore(settings.tenant_loop_max_concurrency)

    async def _one(tenant_id) -> None:
        async with semaphore:
            try:
                await service._recalculate_storage_for_tenant(pool, tenant_id, settings, force=True)
            except service.SubscriptionNotFoundError:
                pass  # tenant has no subscription yet, nothing to compute

    await asyncio.gather(*(_one(t["id"]) for t in tenants))


@celery_app.task(name="billing.recalculate_storage_daily")
def recalculate_storage_daily_task() -> None:
    run_async(_recalculate_all_tenants_storage())
