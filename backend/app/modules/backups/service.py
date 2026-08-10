import asyncio
import logging
import secrets
import subprocess
from datetime import datetime, timedelta, timezone

import asyncpg

from app.core.config import Settings, get_settings
from app.core.crypto import decrypt_secret, encrypt_secret
from app.core.database import platform_connection
from app.core.security import hash_token
from app.modules.notifications import telegram
from app.modules.tenants import repository as tenants_repository
from app.modules.tenants.service import TwoFactorRequiredError

from . import repository

logger = logging.getLogger("dashboarduz.backups")

# Telegram's Bot API caps file uploads at 50MB; a safety margin below that
# so we fail loudly (recorded as last_backup_error) instead of a Telegram
# 413 the caller has to go dig logs for.
_MAX_TELEGRAM_UPLOAD_BYTES = 45 * 1024 * 1024


class TelegramNotConfiguredError(Exception):
    pass


def _status_from_row(row: dict | None) -> dict:
    if row is None:
        return {
            "bot_configured": False,
            "bot_username": None,
            "configured": False,
            "chat_id": None,
            "link_pending": False,
            "last_backup_at": None,
            "last_backup_status": None,
            "last_backup_error": None,
        }
    bot_configured = row["telegram_bot_token_encrypted"] is not None
    return {
        "bot_configured": bot_configured,
        "bot_username": row["telegram_bot_username"],
        "configured": bot_configured and row["telegram_chat_id"] is not None,
        "chat_id": row["telegram_chat_id"],
        "link_pending": row["link_token_hash"] is not None
        and row["link_token_expires_at"] is not None
        and row["link_token_expires_at"] > datetime.now(timezone.utc),
        "last_backup_at": row["last_backup_at"],
        "last_backup_status": row["last_backup_status"],
        "last_backup_error": row["last_backup_error"],
    }


async def get_status(pool: asyncpg.Pool) -> dict:
    async with platform_connection(pool) as conn:
        row = await repository.get_backup_settings(conn)
    return _status_from_row(row)


async def update_bot_token(pool: asyncpg.Pool, admin_id, bot_token: str, reason: str) -> dict:
    """Platform Admin saving the backup bot's credential -- same 2FA + reason
    + audit-log shape as tenants.service.create_tenant_admin_user (this is a
    privileged, tenant-adjacent action: the bot is capable of receiving every
    tenant's data)."""
    async with platform_connection(pool) as conn:
        admin = await tenants_repository.get_platform_admin_by_id(conn, admin_id)
        if admin is None or not admin["totp_enabled"]:
            raise TwoFactorRequiredError

    # Validate the token actually works, and capture the bot's @username so
    # the "add to group" deep link (t.me/<username>?startgroup=...) never
    # needs a separate manual field.
    bot_info = await telegram.get_me(bot_token)

    encrypted = encrypt_secret(bot_token)
    async with platform_connection(pool) as conn:
        row = await repository.upsert_bot_token(conn, encrypted, bot_info.get("username"))
        await tenants_repository.insert_audit_log(
            conn,
            actor_type="platform_admin",
            actor_id=admin_id,
            tenant_id=None,
            action="update_backup_bot_token",
            reason=reason,
        )
    return _status_from_row(row)


async def create_link_token(pool: asyncpg.Pool, settings: Settings) -> dict:
    """"Guruhga qo'shish" -- returns a t.me/<bot>?startgroup=<token> deep
    link. Telegram itself prompts the admin to pick a group to add the bot
    to and delivers the token back as a message inside that group, so the
    chat_id is auto-discovered (never typed in by hand), mirroring
    notifications.service.create_group_link_token's tenant-facing flow."""
    async with platform_connection(pool) as conn:
        row = await repository.get_backup_settings(conn)
        if row is None or row["telegram_bot_token_encrypted"] is None:
            raise TelegramNotConfiguredError
        token = secrets.token_urlsafe(24)
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.telegram_link_token_ttl_minutes)
        await repository.set_link_token(conn, hash_token(token), expires_at)
    return {"deep_link": f"https://t.me/{row['telegram_bot_username']}?startgroup={token}", "expires_at": expires_at}


async def resolve_link(pool: asyncpg.Pool, token: str, chat_id: int) -> bool:
    """Called by tasks.py's poll_link_task for each `/start <token>` message
    it polls up from a group/supergroup chat. Returns False (no-op) for an
    unknown/expired/already-used token."""
    async with platform_connection(pool) as conn:
        return await repository.resolve_link_token(conn, hash_token(token), chat_id)


def _run_pg_dump(database_url: str) -> bytes:
    # -Fc: custom format, already gzip-compressed internally, restorable via
    # `pg_restore` (not psql). A blocking subprocess call -- fine here since
    # this only ever runs inside a Celery task's own dedicated event loop,
    # never the FastAPI request-serving one (see tasks.py).
    result = subprocess.run(
        ["pg_dump", "-Fc", database_url],
        capture_output=True,
        check=False,
        timeout=600,
    )
    if result.returncode != 0:
        raise RuntimeError(f"pg_dump failed (exit {result.returncode}): {result.stderr.decode(errors='replace')[:2000]}")
    return result.stdout


async def run_backup(pool: asyncpg.Pool) -> None:
    async with platform_connection(pool) as conn:
        row = await repository.get_backup_settings(conn)

    if row is None or row["telegram_bot_token_encrypted"] is None or row["telegram_chat_id"] is None:
        async with platform_connection(pool) as conn:
            await repository.record_backup_result(conn, status="failed", error="Backup destination not configured")
        logger.warning("backup skipped: not configured")
        return

    try:
        dump_bytes = await asyncio.to_thread(_run_pg_dump, get_settings().migrations_database_url)
        if len(dump_bytes) > _MAX_TELEGRAM_UPLOAD_BYTES:
            raise RuntimeError(
                f"dump is {len(dump_bytes) / 1024 / 1024:.1f}MB, exceeds the "
                f"{_MAX_TELEGRAM_UPLOAD_BYTES / 1024 / 1024:.0f}MB Telegram upload limit"
            )

        bot_token = decrypt_secret(row["telegram_bot_token_encrypted"])
        filename = f"dashboarduz_{datetime.now(timezone.utc):%Y%m%d_%H%M%S}.dump"
        await telegram.send_document(
            bot_token,
            row["telegram_chat_id"],
            filename,
            dump_bytes,
            caption=f"Tizimly DB backup — {datetime.now(timezone.utc):%Y-%m-%d %H:%M} UTC",
        )
    except Exception as exc:
        logger.exception("backup failed")
        async with platform_connection(pool) as conn:
            await repository.record_backup_result(conn, status="failed", error=str(exc)[:2000])
        raise

    async with platform_connection(pool) as conn:
        await repository.record_backup_result(conn, status="success", error=None)
    logger.info("backup succeeded (%d bytes)", len(dump_bytes))
