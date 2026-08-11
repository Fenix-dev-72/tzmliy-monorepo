import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import asyncpg
import jwt
import redis.asyncio as redis

from app.core.config import Settings
from app.core.database import platform_connection
from app.core.notify import send_code
from app.core.security import (
    decode_token,
    encode_token,
    equalize_password_timing,
    hash_token,
    tokens_match,
    verify_password,
)
from app.modules.auth import otp_store, roles_service, users_service
from app.modules.auth.schemas import TwoFactorResendOut, TwoFactorSetupOut
from app.modules.billing import service as billing_service
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


class ResendCooldownError(Exception):
    """A 2FA email code (setup or login-verify) was sent too recently --
    enforced server-side via otp_store's Redis cooldown keys, not just a
    frontend timer. Carries the remaining wait so the client can show it."""

    def __init__(self, remaining_seconds: int):
        self.remaining_seconds = remaining_seconds


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


def _mask_email(email: str) -> str:
    local, _, domain = email.partition("@")
    visible = local[:2]
    return f"{visible}***@{domain}" if domain else f"{visible}***"


async def _send_platform_two_factor_login_code(redis_client: redis.Redis, settings: Settings, admin_id: UUID, email: str) -> None:
    if settings.two_factor_resend_cooldown_enabled:
        remaining = await otp_store.try_start_platform_two_factor_login_cooldown(
            redis_client, admin_id, settings.two_factor_resend_cooldown_seconds
        )
        if remaining is not None:
            raise ResendCooldownError(remaining)
    code = f"{secrets.randbelow(1_000_000):06d}"
    ttl = timedelta(minutes=settings.otp_code_ttl_minutes)
    await otp_store.set_platform_two_factor_login_code(redis_client, admin_id, hash_token(code), ttl)
    await send_code(channel="email", destination=email, code=code)


async def platform_login(
    pool: asyncpg.Pool, redis_client: redis.Redis, settings: Settings, email: str, password: str
) -> PlatformLoginResponse:
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
            # No reset here — 2FA-code failures below share this counter, and
            # a correct password must not refill the attacker's guess budget.
            pending_token = encode_token(
                {"sub": str(admin["id"]), "type": "platform_two_factor_pending"},
                secret=settings.jwt_secret,
                ttl=timedelta(minutes=settings.two_factor_pending_ttl_minutes),
            )
            try:
                await _send_platform_two_factor_login_code(redis_client, settings, admin["id"], admin["email"])
            except ResendCooldownError:
                # A code was already sent moments ago (e.g. a duplicate login
                # attempt) -- it's still valid, don't fail the login over it.
                pass
            resend_after = settings.two_factor_resend_cooldown_seconds if settings.two_factor_resend_cooldown_enabled else 0
            return PlatformLoginResponse(
                requires_2fa=True, pending_token=pending_token, resend_after_seconds=resend_after
            )

        if admin["failed_login_attempts"] > 0 or admin["locked_until"] is not None:
            await repository.reset_platform_admin_failed_logins(conn, admin["id"])

        pair = await _issue_token_pair(conn, settings, admin["id"])
        return PlatformLoginResponse(access_token=pair.access_token, refresh_token=pair.refresh_token)


async def platform_verify_login_2fa(
    pool: asyncpg.Pool, redis_client: redis.Redis, settings: Settings, pending_token: str, code: str
) -> TokenPair:
    try:
        claims = decode_token(pending_token, secret=settings.jwt_secret)
    except jwt.PyJWTError as exc:
        raise InvalidTwoFactorCodeError from exc
    if claims.get("type") != "platform_two_factor_pending":
        raise InvalidTwoFactorCodeError

    admin_id = UUID(claims["sub"])

    row = await otp_store.get_platform_two_factor_login_code(redis_client, admin_id)
    if row is None or row["attempt_count"] >= settings.otp_max_attempts:
        raise InvalidTwoFactorCodeError

    async with platform_connection(pool) as conn:
        admin = await repository.get_platform_admin_by_id(conn, admin_id)
        if admin is None or not admin["totp_enabled"]:
            raise InvalidTwoFactorCodeError
        if _is_locked(admin):
            raise InvalidTwoFactorCodeError
        if not tokens_match(row["code_hash"], hash_token(code)):
            await repository.record_platform_admin_failed_login(
                conn, admin_id, settings.login_max_failed_attempts, settings.login_lockout_minutes
            )
            await otp_store.increment_platform_two_factor_login_attempt(redis_client, admin_id)
            raise InvalidTwoFactorCodeError
        await otp_store.consume_platform_two_factor_login_code(redis_client, admin_id)
        if admin["failed_login_attempts"] > 0 or admin["locked_until"] is not None:
            await repository.reset_platform_admin_failed_logins(conn, admin_id)
        return await _issue_token_pair(conn, settings, admin_id)


async def resend_platform_login_2fa_code(
    pool: asyncpg.Pool, redis_client: redis.Redis, settings: Settings, pending_token: str
) -> TwoFactorResendOut:
    try:
        claims = decode_token(pending_token, secret=settings.jwt_secret)
    except jwt.PyJWTError as exc:
        raise InvalidTwoFactorCodeError from exc
    if claims.get("type") != "platform_two_factor_pending":
        raise InvalidTwoFactorCodeError

    admin_id = UUID(claims["sub"])
    async with platform_connection(pool) as conn:
        admin = await repository.get_platform_admin_by_id(conn, admin_id)
        if admin is None or not admin["totp_enabled"]:
            raise InvalidTwoFactorCodeError
    await _send_platform_two_factor_login_code(redis_client, settings, admin_id, admin["email"])
    resend_after = settings.two_factor_resend_cooldown_seconds if settings.two_factor_resend_cooldown_enabled else 0
    return TwoFactorResendOut(resend_after_seconds=resend_after)


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


async def setup_2fa(pool: asyncpg.Pool, redis_client: redis.Redis, settings: Settings, admin_id: UUID) -> TwoFactorSetupOut:
    async with platform_connection(pool) as conn:
        admin = await repository.get_platform_admin_by_id(conn, admin_id)
    if settings.two_factor_resend_cooldown_enabled:
        remaining = await otp_store.try_start_platform_two_factor_setup_cooldown(
            redis_client, admin_id, settings.two_factor_resend_cooldown_seconds
        )
        if remaining is not None:
            raise ResendCooldownError(remaining)
    code = f"{secrets.randbelow(1_000_000):06d}"
    ttl = timedelta(minutes=settings.otp_code_ttl_minutes)
    await otp_store.set_platform_two_factor_setup_code(redis_client, admin_id, hash_token(code), ttl)
    await send_code(channel="email", destination=admin["email"], code=code)
    resend_after = settings.two_factor_resend_cooldown_seconds if settings.two_factor_resend_cooldown_enabled else 0
    return TwoFactorSetupOut(email_masked=_mask_email(admin["email"]), resend_after_seconds=resend_after)


async def resend_2fa_setup_code(
    pool: asyncpg.Pool, redis_client: redis.Redis, settings: Settings, admin_id: UUID
) -> TwoFactorSetupOut:
    return await setup_2fa(pool, redis_client, settings, admin_id)


async def confirm_2fa(pool: asyncpg.Pool, redis_client: redis.Redis, settings: Settings, admin_id: UUID, code: str) -> None:
    row = await otp_store.get_platform_two_factor_setup_code(redis_client, admin_id)
    if row is None:
        raise TwoFactorNotSetupError
    if row["attempt_count"] >= settings.otp_max_attempts:
        raise InvalidTwoFactorCodeError
    if not tokens_match(row["code_hash"], hash_token(code)):
        await otp_store.increment_platform_two_factor_setup_attempt(redis_client, admin_id)
        raise InvalidTwoFactorCodeError
    await otp_store.consume_platform_two_factor_setup_code(redis_client, admin_id)
    async with platform_connection(pool) as conn:
        await repository.enable_platform_admin_totp(conn, admin_id)


async def create_tenant(pool: asyncpg.Pool, name: str, slug: str):
    async with platform_connection(pool) as conn:
        tenant = await repository.insert_tenant(conn, name, slug)
        if tenant is None:
            raise TenantSlugTakenError
    await roles_service.seed_default_roles(pool, tenant["id"])
    # Ties the tenant to a real trial billing_plans row (max_users/storage/
    # features all enforceable) instead of just tenants.trial_ends_at's bare
    # column default -- keeps trial_ends_at in sync since run_dunning still
    # reads it directly. No-op if no trial plan is currently configured.
    trial = await billing_service.assign_trial_subscription(pool, tenant["id"])
    if trial is not None:
        async with platform_connection(pool) as conn:
            tenant = await repository.update_tenant_trial_ends_at(conn, tenant["id"], trial["trial_ends_at"])
    return tenant


async def list_tenants(pool: asyncpg.Pool):
    async with platform_connection(pool) as conn:
        return await repository.list_tenants(conn)


async def get_tenant_by_id(pool: asyncpg.Pool, tenant_id: UUID) -> dict | None:
    async with platform_connection(pool) as conn:
        return await repository.get_tenant_by_id(conn, tenant_id)


async def get_tenant_by_slug(pool: asyncpg.Pool, slug: str) -> dict | None:
    # tenants has no RLS (platform-level, like platform_admins) -- safe to
    # query via platform_connection without a tenant_id in scope, same as
    # every other tenants.* lookup in this module.
    async with platform_connection(pool) as conn:
        return await repository.get_tenant_by_slug(conn, slug)


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
    # allow_admin_role=True: this is the one legitimate caller allowed to
    # hand out the system 'admin' role (bootstrapping a brand-new tenant's
    # first user) -- see users_service.create_user's docstring.
    user = await users_service.create_user(
        pool, tenant_id, email, password, admin_role["id"], allow_admin_role=True
    )

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
