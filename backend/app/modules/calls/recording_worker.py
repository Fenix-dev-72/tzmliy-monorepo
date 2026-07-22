"""Background call-recording download+upload worker (optimize.md #10,
2026-07-14) -- calls/service.py's ingest_webhook used to do this inline,
inside the webhook request itself, so a slow/unresponsive provider recording
endpoint directly slowed down webhook processing. Same
"dedicated column + asyncio.create_task worker" convention as
payroll_worker.py/export_worker.py, started/cancelled in main.py's lifespan.
"""

import asyncio
import logging

import asyncpg

from app.core.config import Settings
from app.core.database import platform_connection, tenant_connection
from app.core.storage import put_object
from app.modules.calls import repository
from app.modules.calls.providers import download_recording
from app.modules.tenants import repository as tenants_repository

logger = logging.getLogger("dashboarduz.calls.recording_worker")

_BATCH_SIZE_PER_TENANT = 20


async def _process_tenant(pool: asyncpg.Pool, tenant_id, max_attempts: int) -> None:
    async with tenant_connection(pool, tenant_id) as conn:
        pending = await repository.claim_calls_with_pending_recording(conn, _BATCH_SIZE_PER_TENANT)

    for call in pending:
        object_key = f"recordings/{tenant_id}/{call['id']}.mp3"
        try:
            data = await download_recording(call["pending_recording_url"])
            await put_object(object_key, data)
        except Exception:
            logger.warning("recording download/upload failed for call %s", call["id"], exc_info=True)
            async with tenant_connection(pool, tenant_id) as conn:
                await repository.mark_call_recording_failed(conn, call["id"], max_attempts)
        else:
            async with tenant_connection(pool, tenant_id) as conn:
                await repository.update_call_recording_key(conn, call["id"], object_key)


async def process_pending_recordings(pool: asyncpg.Pool, settings: Settings) -> None:
    async with platform_connection(pool) as conn:
        all_tenants = await tenants_repository.list_tenants(conn)
    for tenant in all_tenants:
        try:
            await _process_tenant(pool, tenant["id"], settings.calls_recording_max_attempts)
        except Exception:
            logger.exception("recording worker tick failed for tenant %s", tenant["id"])


async def run_forever(pool: asyncpg.Pool, settings: Settings) -> None:
    logger.info("call recording worker starting, poll interval=%ss", settings.calls_recording_worker_poll_seconds)
    while True:
        try:
            await process_pending_recordings(pool, settings)
        except Exception:
            logger.exception("recording worker tick failed")
        await asyncio.sleep(settings.calls_recording_worker_poll_seconds)
