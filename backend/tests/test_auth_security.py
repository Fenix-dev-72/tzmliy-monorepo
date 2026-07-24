"""Auth primitives + permission-gate invariants.

These lock in the token/authz logic in `core/security.py` and `core/deps.py`
without needing a DB or a running app: the dependency functions are called
directly (bypassing FastAPI's injector) with hand-built tokens, and the
security helpers are exercised in isolation. Fast and deterministic — they run
even when Postgres is down (unlike the RLS suite).
"""

from datetime import timedelta
from types import SimpleNamespace
from uuid import uuid4

import jwt
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.core.deps import (
    AuthContext,
    get_current_dashboard,
    get_current_platform_admin,
    get_current_user,
    require_permission,
)
from app.core.security import (
    decode_token,
    encode_token,
    hash_password,
    hash_token,
    tokens_match,
    verify_password,
)
from app.modules.auth.permissions import FINANCE_MANAGE, PRIVILEGED_PERMISSIONS, USERS_VIEW

SECRET = "test-secret-key-not-a-real-one-but-at-least-32-bytes-long"
_SETTINGS = SimpleNamespace(jwt_secret=SECRET)


def _creds(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def _token(*, secret: str = SECRET, ttl: timedelta = timedelta(minutes=5), **claims) -> str:
    base = {"type": "access", "sub": str(uuid4()), "tenant_id": str(uuid4()), "permissions": [], "totp_enabled": False}
    base.update(claims)
    return encode_token(base, secret=secret, ttl=ttl)


# --- get_current_user -------------------------------------------------------


def test_valid_access_token_yields_authcontext():
    uid, tid = str(uuid4()), str(uuid4())
    token = _token(sub=uid, tenant_id=tid, permissions=[USERS_VIEW], totp_enabled=True)
    ctx = get_current_user(_creds(token), _SETTINGS)
    assert str(ctx.user_id) == uid
    assert str(ctx.tenant_id) == tid
    assert ctx.permissions == frozenset({USERS_VIEW})
    assert ctx.totp_enabled is True


def test_missing_credentials_is_401():
    with pytest.raises(HTTPException) as exc:
        get_current_user(None, _SETTINGS)
    assert exc.value.status_code == 401


def test_wrong_token_type_is_rejected():
    token = _token(type="refresh")
    with pytest.raises(HTTPException) as exc:
        get_current_user(_creds(token), _SETTINGS)
    assert exc.value.status_code == 401


def test_bad_signature_is_rejected():
    token = _token(secret="a-completely-different-secret-at-least-32-bytes")
    with pytest.raises(HTTPException) as exc:
        get_current_user(_creds(token), _SETTINGS)
    assert exc.value.status_code == 401


def test_expired_token_is_rejected():
    token = _token(ttl=timedelta(minutes=-1))
    with pytest.raises(HTTPException) as exc:
        get_current_user(_creds(token), _SETTINGS)
    assert exc.value.status_code == 401


# --- require_permission -----------------------------------------------------


def _auth(permissions, *, totp_enabled=False) -> AuthContext:
    return AuthContext(
        user_id=uuid4(), tenant_id=uuid4(), permissions=frozenset(permissions), totp_enabled=totp_enabled
    )


def test_require_permission_allows_when_present():
    checker = require_permission(USERS_VIEW)
    auth = _auth({USERS_VIEW})
    assert checker(auth) is auth


def test_require_permission_denies_when_absent():
    checker = require_permission(USERS_VIEW)
    with pytest.raises(HTTPException) as exc:
        checker(_auth(set()))
    assert exc.value.status_code == 403


def test_privileged_permission_requires_totp():
    assert FINANCE_MANAGE in PRIVILEGED_PERMISSIONS  # guard: the test's premise holds
    checker = require_permission(FINANCE_MANAGE)
    with pytest.raises(HTTPException) as exc:
        checker(_auth({FINANCE_MANAGE}, totp_enabled=False))
    assert exc.value.status_code == 403


def test_privileged_permission_allows_with_totp():
    checker = require_permission(FINANCE_MANAGE)
    auth = _auth({FINANCE_MANAGE}, totp_enabled=True)
    assert checker(auth) is auth


# --- token audience separation ----------------------------------------------


def test_platform_admin_rejects_tenant_access_token():
    with pytest.raises(HTTPException) as exc:
        get_current_platform_admin(_creds(_token(type="access")), _SETTINGS)
    assert exc.value.status_code == 401


def test_platform_admin_accepts_platform_access_token():
    admin_id = str(uuid4())
    token = _token(type="platform_access", sub=admin_id)
    ctx = get_current_platform_admin(_creds(token), _SETTINGS)
    assert str(ctx.admin_id) == admin_id


def test_tenant_user_rejects_platform_token():
    with pytest.raises(HTTPException) as exc:
        get_current_user(_creds(_token(type="platform_access")), _SETTINGS)
    assert exc.value.status_code == 401


def test_dashboard_requires_dashboard_session_type():
    token = _token(type="dashboard_session")
    ctx = get_current_dashboard(_creds(token), _SETTINGS)
    assert ctx.dashboard_id is not None
    with pytest.raises(HTTPException):
        get_current_dashboard(_creds(_token(type="access")), _SETTINGS)


# --- security primitives ----------------------------------------------------


async def test_password_hash_and_verify_roundtrip():
    hashed = await hash_password("correct horse battery staple")
    assert hashed != "correct horse battery staple"  # never stored in the clear
    assert await verify_password("correct horse battery staple", hashed) is True
    assert await verify_password("wrong password", hashed) is False


def test_hash_token_is_deterministic_sha256():
    import hashlib

    token = "some.jwt.value"
    assert hash_token(token) == hashlib.sha256(token.encode()).hexdigest()
    assert hash_token(token) == hash_token(token)


def test_tokens_match_is_constant_time_equality():
    assert tokens_match("abc", "abc") is True
    assert tokens_match("abc", "abd") is False


def test_decode_token_rejects_wrong_secret():
    token = encode_token({"type": "access"}, secret=SECRET, ttl=timedelta(minutes=5))
    with pytest.raises(jwt.PyJWTError):
        decode_token(token, secret="another-secret-that-is-also-at-least-32-bytes")
