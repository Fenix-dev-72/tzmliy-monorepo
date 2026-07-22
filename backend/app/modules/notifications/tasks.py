"""Celery tasks for the entire Telegram notification pipeline (2026-07-14,
explicit user request to move this off the asyncio.create_task poll-loop
convention onto Celery + Beat) -- replaces notifications/worker.py and
telegram_link_worker.py's `run_forever` loops. CRM/finance/reports workers are
NOT part of this migration; they keep their existing asyncio workers.

Celery's own tasks are sync functions -- `run_async` bridges into this
module's async DB/Telegram code via one long-lived event loop + asyncpg pool
per worker process. asyncpg pools don't survive fork(), so the pool is (re)
created lazily on first use in each process and also eagerly on
`worker_process_init` (fires once per forked prefork child, and once at
startup for --pool=solo) -- whichever happens first for a given process.
"""

import asyncio
import logging
import re
from datetime import datetime, timedelta, timezone
from uuid import UUID

import redis.asyncio as aioredis
from celery.signals import worker_process_init

from app.core.celery_app import celery_app
from app.core.config import get_settings
from app.core.crypto import decrypt_secret
from app.core.database import create_pool, platform_connection, tenant_connection
from app.core import storage
from app.modules.calls import repository as calls_repository
from app.modules.notifications import repository, service, telegram
from app.modules.tenants import repository as tenants_repository

logger = logging.getLogger("dashboarduz.notifications.tasks")

TELEGRAM_PROVIDER = "telegram"
_MAX_BACKOFF_MINUTES = 60
# Same fixed Asia/Tashkent offset as analytics/service.py and
# notifications/service.py -- "now"/"send_time" mean the same wall-clock day.
_TASHKENT_TZ = timezone(timedelta(hours=5))

_loop: asyncio.AbstractEventLoop | None = None
_pool = None
_redis = None


def _ensure_loop() -> asyncio.AbstractEventLoop:
    global _loop
    if _loop is None:
        _loop = asyncio.new_event_loop()
    return _loop


def run_async(coro):
    return _ensure_loop().run_until_complete(coro)


async def _get_pool_async():
    global _pool
    if _pool is None:
        _pool = await create_pool(get_settings())
    return _pool


def get_pool():
    return run_async(_get_pool_async())


async def _get_redis_async() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(get_settings().telegram_offset_redis_url, decode_responses=True)
    return _redis


@worker_process_init.connect
def _on_worker_process_init(**kwargs) -> None:
    # Pre-warm the pool right after fork (prefork) or at startup (solo), in
    # this process's own event loop -- see module docstring.
    global _pool, _loop, _redis
    _pool = None
    _redis = None
    _loop = None
    run_async(_get_pool_async())


# ---------------------------------------------------------------------------
# Outbox delivery (was notifications/worker.py)
# ---------------------------------------------------------------------------


def _backoff_delay_minutes(retry_count: int) -> float:
    return min(2**retry_count, _MAX_BACKOFF_MINUTES)


async def _attempt_delivery_async(tenant_id: UUID, outbox_id: UUID) -> None:
    pool = await _get_pool_async()
    async with tenant_connection(pool, tenant_id) as conn:
        message = await repository.get_outbox_message_by_id(conn, outbox_id)
        if message is None or message["status"] != "pending":
            return  # already delivered/dead-lettered by an overlapping run
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
                await telegram.send_document(bot_token, message["telegram_chat_id"], message["document_filename"], data)
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
            next_attempt_at = datetime.now(timezone.utc) + timedelta(minutes=_backoff_delay_minutes(message["retry_count"]))
            await repository.mark_outbox_retry_or_dead_letter(conn, message["id"], error, next_attempt_at)
            await repository.insert_delivery_log(conn, tenant_id, message["id"], attempt_number, "failed", error)


@celery_app.task(name="notifications.deliver_outbox_message")
def deliver_outbox_message_task(outbox_id: str, tenant_id: str) -> None:
    run_async(_attempt_delivery_async(UUID(tenant_id), UUID(outbox_id)))


async def _dispatch_due_outbox_async() -> None:
    pool = await _get_pool_async()
    async with platform_connection(pool) as conn:
        all_tenants = await tenants_repository.list_tenants(conn)

    now = datetime.now(timezone.utc)
    settings = get_settings()
    semaphore = asyncio.Semaphore(settings.tenant_loop_max_concurrency)

    # optimize.md #24 (2026-07-18): was a sequential `for tenant in
    # all_tenants` loop -- one slow/unresponsive tenant connection delayed
    # every other tenant's outbox from being dispatched on this tick. Same
    # bounded-concurrency shape as crm/worker.py's sync_meta_ads.
    async def _dispatch_for_tenant(tenant: dict) -> None:
        async with semaphore:
            try:
                async with tenant_connection(pool, tenant["id"]) as conn:
                    due = await repository.list_due_outbox_messages(conn, now)
            except Exception:
                logger.exception("failed listing due outbox for tenant %s", tenant["id"])
                return
            for message in due:
                deliver_outbox_message_task.delay(str(message["id"]), str(tenant["id"]))

    await asyncio.gather(*(_dispatch_for_tenant(tenant) for tenant in all_tenants))


@celery_app.task(name="notifications.dispatch_due_outbox")
def dispatch_due_outbox_task() -> None:
    run_async(_dispatch_due_outbox_async())


# ---------------------------------------------------------------------------
# Schedule dispatch (was service.send_daily_schedule_if_due, single-schedule)
# ---------------------------------------------------------------------------


@celery_app.task(name="notifications.run_schedule")
def run_schedule_task(schedule_id: str, tenant_id: str) -> None:
    pool = get_pool()
    message = run_async(service.run_schedule_if_due(pool, UUID(tenant_id), UUID(schedule_id)))
    if message is not None:
        deliver_outbox_message_task.delay(str(message["id"]), tenant_id)


async def _dispatch_due_schedules_async() -> None:
    pool = await _get_pool_async()
    async with platform_connection(pool) as conn:
        all_tenants = await tenants_repository.list_tenants(conn)

    now_tashkent = datetime.now(_TASHKENT_TZ)
    settings = get_settings()
    semaphore = asyncio.Semaphore(settings.tenant_loop_max_concurrency)

    # optimize.md #24 (2026-07-18): same sequential-loop fix as
    # _dispatch_due_outbox_async above.
    async def _dispatch_for_tenant(tenant: dict) -> None:
        async with semaphore:
            try:
                async with tenant_connection(pool, tenant["id"]) as conn:
                    schedules = await repository.list_enabled_schedules(conn)
            except Exception:
                logger.exception("failed listing schedules for tenant %s", tenant["id"])
                return
            for schedule in schedules:
                if service.is_schedule_due(schedule, now_tashkent):
                    run_schedule_task.delay(str(schedule["id"]), str(tenant["id"]))

    await asyncio.gather(*(_dispatch_for_tenant(tenant) for tenant in all_tenants))


@celery_app.task(name="notifications.dispatch_due_schedules")
def dispatch_due_schedules_task() -> None:
    run_async(_dispatch_due_schedules_async())


# ---------------------------------------------------------------------------
# Group-link polling (was telegram_link_worker.py)
# ---------------------------------------------------------------------------

_START_COMMAND_RE = re.compile(r"^/start(?:@\w+)?(?:\s+(\S+))?$")
_LINK_COMMAND_RE = re.compile(r"^/link(?:@\w+)?\s+(\S+)$")

_OFFSET_KEY_PREFIX = "telegram_link_offset:"


async def _get_offset(tenant_id: UUID) -> int | None:
    r = await _get_redis_async()
    value = await r.get(f"{_OFFSET_KEY_PREFIX}{tenant_id}")
    return int(value) if value is not None else None


async def _set_offset(tenant_id: UUID, offset: int) -> None:
    r = await _get_redis_async()
    await r.set(f"{_OFFSET_KEY_PREFIX}{tenant_id}", offset)


async def _poll_tenant_group_links_async(tenant_id: UUID) -> None:
    pool = await _get_pool_async()
    async with tenant_connection(pool, tenant_id) as conn:
        credential = await calls_repository.get_active_integration_credential_with_account(conn, TELEGRAM_PROVIDER)
    if credential is None:
        return
    bot_token = decrypt_secret(credential["webhook_secret_encrypted"])

    offset = await _get_offset(tenant_id)
    updates = await telegram.get_updates(bot_token, offset)
    for update in updates:
        await _set_offset(tenant_id, update["update_id"] + 1)
        message = update.get("message") or {}
        text = message.get("text", "")
        chat = message.get("chat") or {}
        chat_id = chat.get("id")
        if chat_id is None:
            continue
        chat_type = chat.get("type")
        link_match = _LINK_COMMAND_RE.match(text) if chat_type in ("group", "supergroup") else None
        start_match = _START_COMMAND_RE.match(text)

        if link_match:
            token = link_match.group(1)
            linked = await service.resolve_telegram_group_link(pool, tenant_id, token, chat_id)
            confirmation = "Guruh muvaffaqiyatli ulandi."
        elif start_match and start_match.group(1):
            token = start_match.group(1)
            if chat_type in ("group", "supergroup"):
                linked = await service.resolve_telegram_group_link(pool, tenant_id, token, chat_id)
                confirmation = "Guruh muvaffaqiyatli ulandi."
            else:
                linked = await service.resolve_telegram_link(pool, tenant_id, token, chat_id)
                confirmation = "Telegram hisobingiz muvaffaqiyatli ulandi."
        else:
            continue
        if linked:
            try:
                await telegram.send_message(bot_token, chat_id, confirmation)
            except telegram.TelegramApiError:
                logger.warning("group link succeeded but confirmation send failed", exc_info=True)


@celery_app.task(name="notifications.poll_tenant_group_links")
def poll_tenant_group_links_task(tenant_id: str) -> None:
    run_async(_poll_tenant_group_links_async(UUID(tenant_id)))


async def _dispatch_poll_group_links_async() -> None:
    pool = await _get_pool_async()
    async with platform_connection(pool) as conn:
        all_tenants = await tenants_repository.list_tenants(conn)
    for tenant in all_tenants:
        poll_tenant_group_links_task.delay(str(tenant["id"]))


@celery_app.task(name="notifications.poll_group_links")
def poll_group_links_task() -> None:
    run_async(_dispatch_poll_group_links_async())
