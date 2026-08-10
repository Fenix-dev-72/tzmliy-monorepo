"""Email-OTP 2FA (2026-08-10, replaced TOTP/Google-Authenticator QR): setup,
resend, and login-verify all mail a 6-digit code instead of relying on a
scanned authenticator secret. Exercises the real router+service+otp_store
stack for both tenant users (HTTP-level, via the real FastAPI app) and
Platform Admin (service-level, since no HTTP login fixture exists for it).

`send_code` is monkeypatched to capture the code that would have been
emailed -- SMTP isn't configured in this test environment, and the plaintext
code is never returned to a caller once hashed+stored, so intercepting the
outbound call is the only way to get it for assertions.
"""

from uuid import uuid4

import pytest
import redis.asyncio as aioredis

from app.core.config import get_settings
from app.modules.auth import service as auth_service
from app.modules.tenants import service as tenants_service

SETUP = "/api/v1/auth/2fa/setup"
RESEND_SETUP = "/api/v1/auth/2fa/resend-setup-code"
CONFIRM = "/api/v1/auth/2fa/confirm"
LOGIN = "/api/v1/auth/login"
VERIFY_LOGIN = "/api/v1/auth/2fa/verify-login"
RESEND_LOGIN = "/api/v1/auth/2fa/resend-login-code"


def _capture_send_code(monkeypatch, module):
    captured: dict = {}

    async def fake_send_code(*, channel, destination, code, link=None):
        captured["channel"] = channel
        captured["destination"] = destination
        captured["code"] = code

    monkeypatch.setattr(module, "send_code", fake_send_code)
    return captured


async def _login_token(api_client, http_user) -> str:
    resp = await api_client.post(LOGIN, json={"identifier": http_user["identifier"], "password": http_user["password"]})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


# --- tenant user: setup / confirm --------------------------------------


async def test_setup_then_confirm_enables_2fa(api_client, http_user, monkeypatch):
    captured = _capture_send_code(monkeypatch, auth_service)
    token = await _login_token(api_client, http_user)

    resp = await api_client.post(SETUP, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200, resp.text
    assert captured["channel"] == "email"
    assert captured["destination"] == http_user["identifier"]
    assert resp.json()["email_masked"].endswith(http_user["identifier"].split("@")[1])

    confirm = await api_client.post(
        CONFIRM, headers={"Authorization": f"Bearer {token}"}, json={"code": captured["code"]}
    )
    assert confirm.status_code == 204, confirm.text


async def test_confirm_with_wrong_code_is_400(api_client, http_user, monkeypatch):
    _capture_send_code(monkeypatch, auth_service)
    token = await _login_token(api_client, http_user)
    await api_client.post(SETUP, headers={"Authorization": f"Bearer {token}"})

    resp = await api_client.post(CONFIRM, headers={"Authorization": f"Bearer {token}"}, json={"code": "000000"})
    assert resp.status_code == 400


async def test_confirm_without_setup_is_400(api_client, http_user):
    token = await _login_token(api_client, http_user)
    resp = await api_client.post(CONFIRM, headers={"Authorization": f"Bearer {token}"}, json={"code": "123456"})
    assert resp.status_code == 400


async def test_resend_setup_code_invalidates_previous_code(api_client, http_user, monkeypatch):
    captured = _capture_send_code(monkeypatch, auth_service)
    monkeypatch.setattr(get_settings(), "two_factor_resend_cooldown_enabled", False)
    token = await _login_token(api_client, http_user)
    await api_client.post(SETUP, headers={"Authorization": f"Bearer {token}"})
    first_code = captured["code"]

    resp = await api_client.post(RESEND_SETUP, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200, resp.text
    second_code = captured["code"]
    assert first_code != second_code

    stale = await api_client.post(CONFIRM, headers={"Authorization": f"Bearer {token}"}, json={"code": first_code})
    assert stale.status_code == 400

    fresh = await api_client.post(CONFIRM, headers={"Authorization": f"Bearer {token}"}, json={"code": second_code})
    assert fresh.status_code == 204, fresh.text


# --- tenant user: login-verify ------------------------------------------


async def test_login_with_2fa_enabled_sends_code_and_requires_it(api_client, http_user, monkeypatch):
    captured = _capture_send_code(monkeypatch, auth_service)
    token = await _login_token(api_client, http_user)
    await api_client.post(SETUP, headers={"Authorization": f"Bearer {token}"})
    await api_client.post(CONFIRM, headers={"Authorization": f"Bearer {token}"}, json={"code": captured["code"]})

    captured.clear()
    login_resp = await api_client.post(
        LOGIN, json={"identifier": http_user["identifier"], "password": http_user["password"]}
    )
    assert login_resp.status_code == 200, login_resp.text
    body = login_resp.json()
    assert body["requires_2fa"] is True
    assert captured.get("channel") == "email"
    pending_token = body["pending_token"]
    login_code = captured["code"]

    verify = await api_client.post(VERIFY_LOGIN, json={"pending_token": pending_token, "code": login_code})
    assert verify.status_code == 200, verify.text
    assert verify.json()["access_token"]


async def test_verify_login_wrong_code_then_resend_recovers(api_client, http_user, monkeypatch):
    captured = _capture_send_code(monkeypatch, auth_service)
    monkeypatch.setattr(get_settings(), "two_factor_resend_cooldown_enabled", False)
    token = await _login_token(api_client, http_user)
    await api_client.post(SETUP, headers={"Authorization": f"Bearer {token}"})
    await api_client.post(CONFIRM, headers={"Authorization": f"Bearer {token}"}, json={"code": captured["code"]})

    captured.clear()
    login_resp = await api_client.post(
        LOGIN, json={"identifier": http_user["identifier"], "password": http_user["password"]}
    )
    pending_token = login_resp.json()["pending_token"]

    bad = await api_client.post(VERIFY_LOGIN, json={"pending_token": pending_token, "code": "000000"})
    assert bad.status_code == 401

    captured.clear()
    resend = await api_client.post(RESEND_LOGIN, json={"pending_token": pending_token})
    assert resend.status_code == 200, resend.text
    new_code = captured["code"]

    good = await api_client.post(VERIFY_LOGIN, json={"pending_token": pending_token, "code": new_code})
    assert good.status_code == 200, good.text


# --- tenant user: no email on file ---------------------------------------


async def test_setup_without_email_is_rejected(app_pool, two_tenants, owner_conn, monkeypatch):
    captured = _capture_send_code(monkeypatch, auth_service)
    tenant_a, _ = two_tenants
    role_id = await owner_conn.fetchval(
        "INSERT INTO roles (tenant_id, name) VALUES ($1, $2) RETURNING id", tenant_a, "phone-only-role"
    )
    user_id = await owner_conn.fetchval(
        "INSERT INTO users (tenant_id, phone, password_hash, role_id) VALUES ($1, $2, $3, $4) RETURNING id",
        tenant_a,
        f"+99890{uuid4().int % 10**7:07d}",
        "not-a-real-hash",
        role_id,
    )
    settings = get_settings()
    redis_client = aioredis.Redis(host="localhost", port=6379, db=8, decode_responses=True)
    try:
        with pytest.raises(auth_service.NoEmailForTwoFactorError):
            await auth_service.setup_2fa(app_pool, redis_client, settings, tenant_a, user_id)
        assert "channel" not in captured
    finally:
        await redis_client.aclose()


# --- Platform Admin: same flow, service-level (no HTTP login fixture exists) --


async def test_platform_admin_setup_and_login_verify(app_pool, owner_conn, monkeypatch):
    captured = _capture_send_code(monkeypatch, tenants_service)
    settings = get_settings()
    monkeypatch.setattr(settings, "two_factor_resend_cooldown_enabled", False)
    redis_client = aioredis.Redis(host="localhost", port=6379, db=8, decode_responses=True)
    admin_id = await owner_conn.fetchval(
        "INSERT INTO platform_admins (email, password_hash, totp_enabled) VALUES ($1, 'x', false) RETURNING id",
        f"2fa-email-test-{uuid4()}@example.com",
    )
    try:
        setup_out = await tenants_service.setup_2fa(app_pool, redis_client, settings, admin_id)
        assert captured["channel"] == "email"
        setup_code = captured["code"]
        assert setup_out.email_masked.endswith("@example.com")

        await tenants_service.confirm_2fa(app_pool, redis_client, settings, admin_id, setup_code)
        admin_row = await owner_conn.fetchrow("SELECT totp_enabled FROM platform_admins WHERE id = $1", admin_id)
        assert admin_row["totp_enabled"] is True

        # Wrong code on confirm (re-setup first, since the prior code was consumed).
        captured.clear()
        await tenants_service.resend_2fa_setup_code(app_pool, redis_client, settings, admin_id)
        with pytest.raises(tenants_service.InvalidTwoFactorCodeError):
            await tenants_service.confirm_2fa(app_pool, redis_client, settings, admin_id, "000000")
    finally:
        await redis_client.aclose()


# --- Resend cooldown: server-side, Redis-backed, configurable -------------
#
# 2026-08-10: the frontend's original resend cooldown was a client-only 30s
# timer -- trivially bypassed and shorter than the real worst-case email
# delivery latency (~75s: Celery queue + SMTP). This enforces the wait
# server-side instead, keyed per-user in Redis, and gated by a Settings flag
# so it can be tuned or disabled entirely.


async def test_resend_setup_code_blocked_within_cooldown(api_client, http_user, monkeypatch):
    captured = _capture_send_code(monkeypatch, auth_service)
    settings = get_settings()
    monkeypatch.setattr(settings, "two_factor_resend_cooldown_enabled", True)
    monkeypatch.setattr(settings, "two_factor_resend_cooldown_seconds", 75)
    token = await _login_token(api_client, http_user)

    first = await api_client.post(SETUP, headers={"Authorization": f"Bearer {token}"})
    assert first.status_code == 200, first.text
    first_code = captured["code"]

    too_soon = await api_client.post(RESEND_SETUP, headers={"Authorization": f"Bearer {token}"})
    assert too_soon.status_code == 429, too_soon.text
    retry_after = int(too_soon.headers["Retry-After"])
    assert 0 < retry_after <= 75

    # The original code is still valid -- a blocked resend must not have
    # consumed or overwritten it.
    confirm = await api_client.post(
        CONFIRM, headers={"Authorization": f"Bearer {token}"}, json={"code": first_code}
    )
    assert confirm.status_code == 204, confirm.text


async def test_resend_setup_code_cooldown_can_be_disabled(api_client, http_user, monkeypatch):
    captured = _capture_send_code(monkeypatch, auth_service)
    settings = get_settings()
    monkeypatch.setattr(settings, "two_factor_resend_cooldown_enabled", False)
    token = await _login_token(api_client, http_user)

    await api_client.post(SETUP, headers={"Authorization": f"Bearer {token}"})
    first_code = captured["code"]

    immediate_resend = await api_client.post(RESEND_SETUP, headers={"Authorization": f"Bearer {token}"})
    assert immediate_resend.status_code == 200, immediate_resend.text
    assert immediate_resend.json()["resend_after_seconds"] == 0
    assert captured["code"] != first_code


async def test_login_resend_cooldown_does_not_break_login_itself(api_client, http_user, monkeypatch):
    captured = _capture_send_code(monkeypatch, auth_service)
    settings = get_settings()
    monkeypatch.setattr(settings, "two_factor_resend_cooldown_enabled", True)
    monkeypatch.setattr(settings, "two_factor_resend_cooldown_seconds", 75)
    token = await _login_token(api_client, http_user)
    await api_client.post(SETUP, headers={"Authorization": f"Bearer {token}"})
    await api_client.post(CONFIRM, headers={"Authorization": f"Bearer {token}"}, json={"code": captured["code"]})

    # Two rapid duplicate login attempts (e.g. a double-click) must not fail
    # the second one just because a login-code was already sent moments ago
    # -- the earlier code is still valid and login() swallows the cooldown.
    captured.clear()
    first_login = await api_client.post(
        LOGIN, json={"identifier": http_user["identifier"], "password": http_user["password"]}
    )
    assert first_login.status_code == 200, first_login.text
    assert first_login.json()["resend_after_seconds"] == 75

    second_login = await api_client.post(
        LOGIN, json={"identifier": http_user["identifier"], "password": http_user["password"]}
    )
    assert second_login.status_code == 200, second_login.text

    # But an explicit resend click still respects the cooldown.
    resend = await api_client.post(RESEND_LOGIN, json={"pending_token": second_login.json()["pending_token"]})
    assert resend.status_code == 429, resend.text
