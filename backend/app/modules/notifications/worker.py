"""Background outbox delivery loop -- the first real background-worker-style
infra in this repo (everything before this, e.g. finance payroll / billing
storage-recalculate, is on-demand-only). Started as an asyncio.create_task in
main.py's lifespan, cancelled on shutdown.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

import asyncpg

from app.core.config import Settings
from app.core.crypto import decrypt_secret
from app.core.database import platform_connection, tenant_connection
from app.core import storage
from app.modules.calls import repository as calls_repository
from app.modules.notifications import repository, telegram
from app.modules.tenants import repository as tenants_repository

logger = logging.getLogger("dashboarduz.notifications.worker")

TELEGRAM_PROVIDER = "telegram"
_MAX_BACKOFF_MINUTES = 60


def _backoff_delay(retry_count: int) -> timedelta:
    return timedelta(minutes=min(2**retry_count, _MAX_BACKOFF_MINUTES))


async def _attempt_delivery(pool: asyncpg.Pool, tenant_id, message: dict) -> None:
    async with tenant_connection(pool, tenant_id) as conn:
        credential = await calls_repository.get_active_integration_credential(conn, TELEGRAM_PROVIDER)

    error: str | None = None
    if credential is None:
        error = "Telegram bot not configured for this tenant"
    else:
        bot_token = decrypt_secret(credential["webhook_secret_encrypted"])
        try:
            if message["channel"] == "telegram_message":
                await telegram.send_message(bot_token, message["telegram_chat_id"], message["text_body"])
            else:
                data = await storage.get_object(message["document_object_key"])
                await telegram.send_document(
                    bot_token, message["telegram_chat_id"], message["document_filename"], data
                )
        except telegram.TelegramApiError as exc:
            error = str(exc)
        except Exception as exc:  # network/timeout/object-storage failures
            error = str(exc)

    async with tenant_connection(pool, tenant_id) as conn:
        attempt_number = message["retry_count"] + 1
        if error is None:
            await repository.mark_outbox_sent(conn, message["id"])
            await repository.insert_delivery_log(conn, tenant_id, message["id"], attempt_number, "success", None)
        else:
            next_attempt_at = datetime.now(timezone.utc) + _backoff_delay(message["retry_count"])
            await repository.mark_outbox_retry_or_dead_letter(conn, message["id"], error, next_attempt_at)
            await repository.insert_delivery_log(conn, tenant_id, message["id"], attempt_number, "failed", error)


async def process_due_outbox(pool: asyncpg.Pool) -> None:
    async with platform_connection(pool) as conn:
        all_tenants = await tenants_repository.list_tenants(conn)

    now = datetime.now(timezone.utc)
    for tenant in all_tenants:
        async with tenant_connection(pool, tenant["id"]) as conn:
            due = await repository.list_due_outbox_messages(conn, now)
        for message in due:
            await _attempt_delivery(pool, tenant["id"], message)


async def run_forever(pool: asyncpg.Pool, settings: Settings) -> None:
    logger.info("notifications worker starting, poll interval=%ss", settings.notification_worker_poll_seconds)
    while True:
        try:
            await process_due_outbox(pool)
        except Exception:
            logger.exception("notifications worker tick failed")
        await asyncio.sleep(settings.notification_worker_poll_seconds)
