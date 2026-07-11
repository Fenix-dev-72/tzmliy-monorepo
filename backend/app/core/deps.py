from collections.abc import Callable
from dataclasses import dataclass
from uuid import UUID

import asyncpg
import jwt
import redis.asyncio as redis
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import Settings, get_settings
from app.core.security import decode_token
from app.modules.auth.permissions import PRIVILEGED_PERMISSIONS

bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AuthContext:
    user_id: UUID
    tenant_id: UUID
    permissions: frozenset[str]
    totp_enabled: bool


@dataclass(frozen=True)
class PlatformAuthContext:
    admin_id: UUID


@dataclass(frozen=True)
class DashboardAuthContext:
    dashboard_id: UUID
    tenant_id: UUID


def get_pool(request: Request) -> asyncpg.Pool:
    return request.app.state.pool


def get_redis(request: Request) -> redis.Redis:
    return request.app.state.redis


def _decode_bearer(credentials: HTTPAuthorizationCredentials | None, settings: Settings) -> dict:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    try:
        return decode_token(credentials.credentials, secret=settings.jwt_secret)
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token") from exc


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    settings: Settings = Depends(get_settings),
) -> AuthContext:
    claims = _decode_bearer(credentials, settings)
    if claims.get("type") != "access":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong token type")
    return AuthContext(
        user_id=UUID(claims["sub"]),
        tenant_id=UUID(claims["tenant_id"]),
        permissions=frozenset(claims.get("permissions", [])),
        totp_enabled=bool(claims.get("totp_enabled", False)),
    )


def require_permission(permission_key: str) -> Callable[[AuthContext], AuthContext]:
    """Access tokens embed the permission set at issue time (see
    auth/service.py's _issue_token_pair), so this is a pure claim check —
    no DB round trip. A revoked permission takes effect on next token
    refresh, not instantly; that's the trade-off for keeping authz checks
    off the request's hot path.

    Tokens also embed totp_enabled at issue time, so a permission in
    PRIVILEGED_PERMISSIONS is blocked until the user turns 2FA on and
    re-authenticates (tokens issued before that will still say False until
    they refresh) -- the TZ's "privileged rollar uchun 2FA" requirement."""

    def checker(auth: AuthContext = Depends(get_current_user)) -> AuthContext:
        if permission_key not in auth.permissions:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Missing permission: {permission_key}")
        if permission_key in PRIVILEGED_PERMISSIONS and not auth.totp_enabled:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, f"2FA must be enabled to use this permission: {permission_key}"
            )
        return auth

    return checker


def get_current_platform_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    settings: Settings = Depends(get_settings),
) -> PlatformAuthContext:
    claims = _decode_bearer(credentials, settings)
    if claims.get("type") != "platform_access":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong token type")
    return PlatformAuthContext(admin_id=UUID(claims["sub"]))


def get_current_dashboard(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    settings: Settings = Depends(get_settings),
) -> DashboardAuthContext:
    """A dashboard is a third JWT audience alongside tenant users and platform
    admins -- a named, per-dashboard password (not a users row, see
    analytics/service.py's dashboard_login), access-token-only (no refresh:
    a dashboard is a persistent kiosk screen, it just re-logs-in on expiry)."""
    claims = _decode_bearer(credentials, settings)
    if claims.get("type") != "dashboard_session":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong token type")
    return DashboardAuthContext(dashboard_id=UUID(claims["sub"]), tenant_id=UUID(claims["tenant_id"]))
