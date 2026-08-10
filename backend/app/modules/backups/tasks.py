"""Celery tasks for the DB-backup-to-Telegram feature (2026-08-09).

Reuses notifications/tasks.py's `run_async`/`get_pool` (one shared event
loop + asyncpg pool per Celery worker process, pre-warmed on
`worker_process_init`) rather than standing up a second, competing
loop/pool in this module -- both modules' tasks run on the same
celery_worker OS process.
"""

import re

import redis.asyncio as aioredis

from app.core.celery_app import celery_app
from app.core.config import get_settings
from app.core.crypto import decrypt_secret
from app.core.database import platform_connection
from app.modules.notifications import telegram
from app.modules.notifications.tasks import get_pool, run_async

from . import repository, service

_START_COMMAND_RE = re.compile(r"^/start(?:@\w+)?(?:\s+(\S+))?$")
_OFFSET_KEY = "backup_link_offset"

_redis: aioredis.Redis | None = None


async def _get_redis_async() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(get_settings().telegram_offset_redis_url, decode_responses=True)
    return _redis


@celery_app.task(name="backups.run_daily_backup")
def run_daily_backup_task() -> None:
    pool = get_pool()
    run_async(service.run_backup(pool))


async def _poll_link_async() -> None:
    pool = get_pool()
    async with platform_connection(pool) as conn:
        row = await repository.get_backup_settings(conn)
    if row is None or row["telegram_bot_token_encrypted"] is None:
        return  # no bot configured yet, nothing to poll

    bot_token = decrypt_secret(row["telegram_bot_token_encrypted"])

    r = await _get_redis_async()
    offset_raw = await r.get(_OFFSET_KEY)
    offset = int(offset_raw) if offset_raw is not None else None

    updates = await telegram.get_updates(bot_token, offset)
    for update in updates:
        await r.set(_OFFSET_KEY, update["update_id"] + 1)
        message = update.get("message") or {}
        text = message.get("text", "")
        chat = message.get("chat") or {}
        chat_id = chat.get("id")
        chat_type = chat.get("type")
        if chat_id is None or chat_type not in ("group", "supergroup"):
            continue
        match = _START_COMMAND_RE.match(text)
        if not match or not match.group(1):
            continue
        token = match.group(1)
        linked = await service.resolve_link(pool, token, chat_id)
        if linked:
            try:
                await telegram.send_message(bot_token, chat_id, "Backup guruhi muvaffaqiyatli ulandi.")
            except telegram.TelegramApiError:
                pass  # link already succeeded; a confirmation-send failure isn't worth failing the task over


@celery_app.task(name="backups.poll_link")
def poll_link_task() -> None:
    run_async(_poll_link_async())
