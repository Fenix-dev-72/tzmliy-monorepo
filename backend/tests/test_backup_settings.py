"""Backup-to-Telegram settings: 2FA gate on the bot token, encrypted-at-rest
storage, the self-service "add bot to group" link-token flow (mirrors
notifications.service.create_group_link_token/resolve_telegram_group_link),
and status reporting used by the Platform Admin dashboard's warning banner.
Real Telegram calls are monkeypatched out -- these tests exercise the
DB/2FA/audit-log/token wiring, not network I/O.
"""

from uuid import uuid4

import pytest

from app.core.config import get_settings
from app.modules.backups import service
from app.modules.notifications import telegram
from app.modules.tenants.service import TwoFactorRequiredError


async def _insert_platform_admin(owner_conn, *, totp_enabled: bool) -> str:
    admin_id = await owner_conn.fetchval(
        """
        INSERT INTO platform_admins (email, password_hash, totp_enabled)
        VALUES ($1, 'x', $2)
        RETURNING id
        """,
        f"backup-test-{uuid4()}@example.com",
        totp_enabled,
    )
    return admin_id


@pytest.fixture(autouse=True)
async def _cleanup_backup_settings(owner_conn):
    yield
    await owner_conn.execute("DELETE FROM backup_settings WHERE id = 1")


def _patch_get_me(monkeypatch, username: str = "fake_backup_bot"):
    async def _fake_get_me(bot_token: str) -> dict:
        return {"id": 1, "username": username}

    monkeypatch.setattr(telegram, "get_me", _fake_get_me)


async def test_get_status_not_configured_by_default(app_pool):
    status = await service.get_status(app_pool)
    assert status["bot_configured"] is False
    assert status["configured"] is False
    assert status["last_backup_status"] is None


async def test_update_bot_token_requires_2fa(app_pool, owner_conn):
    admin_id = await _insert_platform_admin(owner_conn, totp_enabled=False)
    with pytest.raises(TwoFactorRequiredError):
        await service.update_bot_token(app_pool, admin_id, "fake-token", "test")


async def test_update_bot_token_success_persists_and_audits(app_pool, owner_conn, monkeypatch):
    admin_id = await _insert_platform_admin(owner_conn, totp_enabled=True)
    _patch_get_me(monkeypatch)

    result = await service.update_bot_token(app_pool, admin_id, "fake-bot-token", "initial setup")
    assert result["bot_configured"] is True
    assert result["bot_username"] == "fake_backup_bot"
    # Bot alone isn't enough -- no group linked yet.
    assert result["configured"] is False

    status = await service.get_status(app_pool)
    assert status["bot_configured"] is True

    audit_row = await owner_conn.fetchrow(
        "SELECT action, reason, tenant_id FROM audit_logs WHERE actor_id = $1 AND action = 'update_backup_bot_token'",
        admin_id,
    )
    assert audit_row is not None
    assert audit_row["reason"] == "initial setup"
    assert audit_row["tenant_id"] is None

    # The stored token is never plaintext.
    raw = await owner_conn.fetchval("SELECT telegram_bot_token_encrypted FROM backup_settings WHERE id = 1")
    assert raw != "fake-bot-token"


async def test_create_link_token_requires_bot_configured(app_pool):
    with pytest.raises(service.TelegramNotConfiguredError):
        await service.create_link_token(app_pool, get_settings())


async def test_link_token_flow_resolves_chat_id(app_pool, owner_conn, monkeypatch):
    admin_id = await _insert_platform_admin(owner_conn, totp_enabled=True)
    _patch_get_me(monkeypatch)
    await service.update_bot_token(app_pool, admin_id, "fake-bot-token", "initial setup")

    link = await service.create_link_token(app_pool, get_settings())
    assert link["deep_link"].startswith("https://t.me/fake_backup_bot?startgroup=")
    token = link["deep_link"].rsplit("=", 1)[1]

    status = await service.get_status(app_pool)
    assert status["link_pending"] is True
    assert status["configured"] is False

    resolved = await service.resolve_link(app_pool, token, -100123456789)
    assert resolved is True

    status = await service.get_status(app_pool)
    assert status["configured"] is True
    assert status["chat_id"] == -100123456789
    assert status["link_pending"] is False

    # A stale/replayed token no longer resolves.
    assert await service.resolve_link(app_pool, token, -100987654321) is False
