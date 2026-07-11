from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import asyncpg
import jwt
import pyotp

from app.core.config import Settings
from app.core.database import platform_connection
from app.core.security import (
    decode_token,
    encode_token,
    equalize_password_timing,
    hash_token,
    tokens_match,
    verify_password,
)
from app.modules.auth import roles_service, users_service
from app.modules.auth.schemas import TwoFactorSetupOut
from app.modules.tenants import repository
from app.modules.tenants.schemas import PlatformLoginResponse, TokenPair


class InvalidCredentialsError(Exception):
    pass


class InvalidRefreshTokenError(Exception):
    pass


class TenantSlugTakenError(Exception):
    pass


class InvalidTwoFactorCodeError(Exception):
    pass


class TwoFactorNotSetupError(Exception):
    pass


class TwoFactorRequiredError(Exception):
    """Raised when a platform admin without 2FA enabled attempts an action
    that touches tenant data — the TZ requires 2FA for that, not just login."""

    pass


async def _issue_token_pair(conn: asyncpg.Connection, settings: Settings, admin_id: UUID) -> TokenPair:
    access_token = encode_token(
        {"sub": str(admin_id), "type": "platform_access"},
        secret=settings.jwt_secret,
        ttl=timedelta(minutes=settings.platform_access_token_ttl_minutes),
    )
    session_id = uuid4()
    refresh_ttl = timedelta(days=settings.platform_refresh_token_ttl_days)
    refresh_token = encode_token(
        {"sub": str(admin_id), "sid": str(session_id), "type": "platform_refresh"},
        secret=settings.jwt_secret,
        ttl=refresh_ttl,
    )
    await repository.insert_platform_admin_session(
        conn,
        session_id=session_id,
        admin_id=admin_id,
        token_hash=hash_token(refresh_token),
        expires_at=datetime.now(timezone.utc) + refresh_ttl,
    )
    return TokenPair(access_token=access_token, refresh_token=refresh_token)


def _is_locked(row: dict) -> bool:
    return row["locked_until"] is not None and row["locked_until"] > datetime.now(timezone.utc)


async def platform_login(pool: asyncpg.Pool, settings: Settings, email: str, password: str) -> PlatformLoginResponse:
    email = email.strip().lower()
    async with platform_connection(pool) as conn:
        admin = await repository.get_platform_admin_by_email(conn, email)
        if admin is None or not admin["is_active"]:
            # Same-cost dummy verify + generic 401 — see auth/service.py's
            # login for the enumeration/timing reasoning; same rules here.
            await equalize_password_timing(password)
            raise InvalidCredentialsError
        if _is_locked(admin):
            await equalize_password_timing(password)
            raise InvalidCredentialsError
        if not await verify_password(password, admin["password_hash"]):
            await repository.record_platform_admin_failed_login(
                conn, admin["id"], settings.login_max_failed_attempts, settings.login_lockout_minutes
            )
            raise InvalidCredentialsError

        if admin["totp_enabled"]:
            # No reset here — TOTP failures below share this counter, and a
            # correct password must not refill the attacker's guess budget.
            pending_token = encode_token(
                {"sub": str(admin["id"]), "type": "platform_two_factor_pending"},
                secret=settings.jwt_secret,
                ttl=timedelta(minutes=settings.two_factor_pending_ttl_minutes),
            )
            return PlatformLoginResponse(requires_2fa=True, pending_token=pending_token)

        if admin["failed_login_attempts"] > 0 or admin["locked_until"] is not None:
            await repository.reset_platform_admin_failed_logins(conn, admin["id"])

        pair = await _issue_token_pair(conn, settings, admin["id"])
        return PlatformLoginResponse(access_token=pair.access_token, refresh_token=pair.refresh_token)


async def platform_verify_login_2fa(pool: asyncpg.Pool, settings: Settings, pending_token: str, code: str) -> TokenPair:
    try:
        claims = decode_token(pending_token, secret=settings.jwt_secret)
    except jwt.PyJWTError as exc:
        raise InvalidTwoFactorCodeError from exc
    if claims.get("type") != "platform_two_factor_pending":
        raise InvalidTwoFactorCodeError

    admin_id = UUID(claims["sub"])

    async with platform_connection(pool) as conn:
        admin = await repository.get_platform_admin_by_id(conn, admin_id)
        if admin is None or not admin["totp_enabled"] or not admin["totp_secret"]:
            raise InvalidTwoFactorCodeError
        if _is_locked(admin):
            raise InvalidTwoFactorCodeError
        if not pyotp.TOTP(admin["totp_secret"]).verify(code, valid_window=1):
            await repository.record_platform_admin_failed_login(
                conn, admin_id, settings.login_max_failed_attempts, settings.login_lockout_minutes
            )
            raise InvalidTwoFactorCodeError
        if admin["failed_login_attempts"] > 0 or admin["locked_until"] is not None:
            await repository.reset_platform_admin_failed_logins(conn, admin_id)
        return await _issue_token_pair(conn, settings, admin_id)


async def platform_refresh(pool: asyncpg.Pool, settings: Settings, refresh_token: str) -> TokenPair:
    try:
        claims = decode_token(refresh_token, secret=settings.jwt_secret)
    except jwt.PyJWTError as exc:
        raise InvalidRefreshTokenError from exc
    if claims.get("type") != "platform_refresh":
        raise InvalidRefreshTokenError

    admin_id = UUID(claims["sub"])
    session_id = UUID(claims["sid"])

    async with platform_connection(pool) as conn:
        session = await repository.get_active_platform_admin_session(conn, session_id, admin_id)
        if session is None or not tokens_match(session["token_hash"], hash_token(refresh_token)):
            raise InvalidRefreshTokenError
        await repository.revoke_platform_admin_session(conn, session_id)
        return await _issue_token_pair(conn, settings, admin_id)


async def platform_logout(pool: asyncpg.Pool, settings: Settings, refresh_token: str) -> None:
    try:
        claims = decode_token(refresh_token, secret=settings.jwt_secret)
    except jwt.PyJWTError:
        return
    if claims.get("type") != "platform_refresh":
        return
    async with platform_connection(pool) as conn:
        await repository.revoke_platform_admin_session(conn, UUID(claims["sid"]))


async def setup_2fa(pool: asyncpg.Pool, admin_id: UUID) -> TwoFactorSetupOut:
    async with platform_connection(pool) as conn:
        admin = await repository.get_platform_admin_by_id(conn, admin_id)
        secret = pyotp.random_base32()
        await repository.set_platform_admin_totp_secret(conn, admin_id, secret)
    uri = pyotp.TOTP(secret).provisioning_uri(name=admin["email"], issuer_name="Dashboarduz Platform")
    return TwoFactorSetupOut(secret=secret, otpauth_uri=uri)


async def confirm_2fa(pool: asyncpg.Pool, admin_id: UUID, code: str) -> None:
    async with platform_connection(pool) as conn:
        admin = await repository.get_platform_admin_by_id(conn, admin_id)
        if admin is None or not admin["totp_secret"]:
            raise TwoFactorNotSetupError
        if not pyotp.TOTP(admin["totp_secret"]).verify(code, valid_window=1):
            raise InvalidTwoFactorCodeError
        await repository.enable_platform_admin_totp(conn, admin_id)


async def create_tenant(pool: asyncpg.Pool, name: str, slug: str):
    async with platform_connection(pool) as conn:
        tenant = await repository.insert_tenant(conn, name, slug)
        if tenant is None:
            raise TenantSlugTakenError
    await roles_service.seed_default_roles(pool, tenant["id"])
    return tenant


async def list_tenants(pool: asyncpg.Pool):
    async with platform_connection(pool) as conn:
        return await repository.list_tenants(conn)


async def create_tenant_admin_user(
    pool: asyncpg.Pool, admin_id: UUID, tenant_id: UUID, email: str, password: str, reason: str
):
    """Platform Admin reaching into a tenant's data (here: creating its first
    user) requires 2FA + a reason + an immutable audit entry, per the TZ."""
    async with platform_connection(pool) as conn:
        admin = await repository.get_platform_admin_by_id(conn, admin_id)
        if admin is None or not admin["totp_enabled"]:
            raise TwoFactorRequiredError

    admin_role = await roles_service.get_role_by_name(pool, tenant_id, "admin")
    # users_service.EmailTakenError propagates as-is; the router catches it.
    user = await users_service.create_user(pool, tenant_id, email, password, admin_role["id"])

    async with platform_connection(pool) as conn:
        await repository.insert_audit_log(
            conn,
            actor_type="platform_admin",
            actor_id=admin_id,
            tenant_id=tenant_id,
            action="create_tenant_admin_user",
            reason=reason,
        )
    return user


async def list_audit_logs(pool: asyncpg.Pool) -> list[dict]:
    async with platform_connection(pool) as conn:
        return await repository.list_audit_logs(conn)
