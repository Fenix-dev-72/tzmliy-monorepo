import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
from uuid import UUID, uuid4

import asyncpg
import jwt
import pyotp
import redis.asyncio as redis

from app.core.config import Settings
from app.core.database import platform_connection, tenant_connection
from app.core.notify import send_code
from app.core.security import (
    decode_token,
    encode_token,
    equalize_password_timing,
    hash_password,
    hash_token,
    tokens_match,
    verify_password,
)
from app.modules.auth import otp_store, repository, roles_service
from app.modules.auth.schemas import LoginResponse, TwoFactorSetupOut
from app.modules.tenants import repository as tenants_repository
from app.modules.tenants.schemas import TokenPair


class InvalidCredentialsError(Exception):
    pass


class InvalidCurrentPasswordError(Exception):
    pass


class InvalidRefreshTokenError(Exception):
    pass


class InvalidResetTokenError(Exception):
    pass


class InvalidOtpError(Exception):
    pass


class InvalidTwoFactorCodeError(Exception):
    pass


class TwoFactorNotSetupError(Exception):
    pass


class IdentifierTakenError(Exception):
    """An email/phone is already registered -- to a NEW account (this
    module) or an existing one (registration). Unlike login/OTP/password
    reset, self-registration deliberately does NOT hide this: telling a
    signup form "this email is already registered" is normal, expected UX,
    not the same enumeration risk as probing an existing account's login."""

    pass


class InvalidRegistrationCodeError(Exception):
    pass


class InvalidRegistrationTokenError(Exception):
    pass


class TenantSlugTakenError(Exception):
    pass


async def _issue_token_pair(
    conn: asyncpg.Connection, settings: Settings, tenant_id: UUID, user_id: UUID, role_id: UUID, totp_enabled: bool
) -> TokenPair:
    permissions = await roles_service.get_role_permission_keys(conn, role_id)
    access_token = encode_token(
        {
            "sub": str(user_id),
            "tenant_id": str(tenant_id),
            "permissions": permissions,
            "totp_enabled": totp_enabled,
            "type": "access",
        },
        secret=settings.jwt_secret,
        ttl=timedelta(minutes=settings.access_token_ttl_minutes),
    )
    session_id = uuid4()
    refresh_ttl = timedelta(days=settings.refresh_token_ttl_days)
    refresh_token = encode_token(
        {"sub": str(user_id), "tenant_id": str(tenant_id), "sid": str(session_id), "type": "refresh"},
        secret=settings.jwt_secret,
        ttl=refresh_ttl,
    )
    await repository.insert_refresh_session(
        conn,
        session_id=session_id,
        tenant_id=tenant_id,
        user_id=user_id,
        token_hash=hash_token(refresh_token),
        expires_at=datetime.now(timezone.utc) + refresh_ttl,
    )
    return TokenPair(access_token=access_token, refresh_token=refresh_token)


def _normalize_identifier(identifier: str) -> str:
    return identifier.strip().lower()


def _identifier_type(identifier: str) -> str:
    return "email" if "@" in identifier else "phone"


async def _resolve_identifier(pool: asyncpg.Pool, identifier: str) -> dict | None:
    """Looks up which tenant/user an email or phone belongs to. Must go
    through platform_connection: `users` carries FORCE ROW LEVEL SECURITY,
    so it can't be queried at all without already knowing app.tenant_id --
    user_login_identifiers is the platform-level table that breaks this
    chicken-and-egg problem (see 0020_self_registration.sql)."""
    async with platform_connection(pool) as conn:
        return await repository.get_login_identifier(conn, identifier)


def _is_locked(row: dict) -> bool:
    return row["locked_until"] is not None and row["locked_until"] > datetime.now(timezone.utc)


async def login(pool: asyncpg.Pool, settings: Settings, identifier: str, password: str) -> LoginResponse:
    identifier = _normalize_identifier(identifier)
    mapping = await _resolve_identifier(pool, identifier)
    if mapping is None:
        # Same bcrypt cost as a real verification, so a bad identifier isn't
        # distinguishable from a bad password by response time.
        await equalize_password_timing(password)
        raise InvalidCredentialsError
    tenant_id = mapping["tenant_id"]

    async with tenant_connection(pool, tenant_id) as conn:
        user = await repository.get_user_by_id(conn, mapping["user_id"])
        if user is None or not user["is_active"]:
            await equalize_password_timing(password)
            raise InvalidCredentialsError
        if _is_locked(user):
            # Locked accounts get the same generic 401 (per OWASP: don't
            # confirm the account exists or that a lockout was triggered) and
            # the password is deliberately NOT verified — a locked window must
            # not be usable as a password-checking oracle.
            await equalize_password_timing(password)
            raise InvalidCredentialsError
        if not await verify_password(password, user["password_hash"]):
            # tenant_connection wraps a transaction, and raising inside it
            # rolls the increment back — so record the failure, exit the
            # block cleanly (commit), and raise only after. (The read-only
            # rejections above may raise in place; they wrote nothing.)
            await repository.record_failed_login(
                conn, user["id"], settings.login_max_failed_attempts, settings.login_lockout_minutes
            )
            response = None
        elif user["totp_enabled"]:
            # Deliberately no reset_failed_logins here: failed TOTP attempts
            # (below, in verify_login_2fa) count into the same counter, and
            # resetting it on every correct password would let an attacker who
            # knows the password bank unlimited TOTP guesses 5 at a time. The
            # counter only resets after the full login (password + TOTP).
            pending_token = encode_token(
                {"sub": str(user["id"]), "tenant_id": str(tenant_id), "type": "two_factor_pending"},
                secret=settings.jwt_secret,
                ttl=timedelta(minutes=settings.two_factor_pending_ttl_minutes),
            )
            response = LoginResponse(requires_2fa=True, pending_token=pending_token)
        else:
            if user["failed_login_attempts"] > 0 or user["locked_until"] is not None:
                await repository.reset_failed_logins(conn, user["id"])
            pair = await _issue_token_pair(conn, settings, tenant_id, user["id"], user["role_id"], user["totp_enabled"])
            response = LoginResponse(access_token=pair.access_token, refresh_token=pair.refresh_token)

    if response is None:
        raise InvalidCredentialsError
    return response


async def verify_login_2fa(pool: asyncpg.Pool, settings: Settings, pending_token: str, code: str) -> TokenPair:
    try:
        claims = decode_token(pending_token, secret=settings.jwt_secret)
    except jwt.PyJWTError as exc:
        raise InvalidTwoFactorCodeError from exc
    if claims.get("type") != "two_factor_pending":
        raise InvalidTwoFactorCodeError

    tenant_id = UUID(claims["tenant_id"])
    user_id = UUID(claims["sub"])

    async with tenant_connection(pool, tenant_id) as conn:
        user = await repository.get_user_by_id(conn, user_id)
        if user is None or not user["totp_enabled"] or not user["totp_secret"]:
            raise InvalidTwoFactorCodeError
        if _is_locked(user):
            raise InvalidTwoFactorCodeError
        if not pyotp.TOTP(user["totp_secret"]).verify(code, valid_window=1):
            # TOTP guesses share the password-failure counter (a 6-digit code
            # is far more brute-forceable than a password), so enough of them
            # locks the account just like wrong passwords do. Commit the
            # increment by exiting the transaction before raising.
            await repository.record_failed_login(
                conn, user_id, settings.login_max_failed_attempts, settings.login_lockout_minutes
            )
            pair = None
        else:
            if user["failed_login_attempts"] > 0 or user["locked_until"] is not None:
                await repository.reset_failed_logins(conn, user_id)
            pair = await _issue_token_pair(conn, settings, tenant_id, user_id, user["role_id"], user["totp_enabled"])

    if pair is None:
        raise InvalidTwoFactorCodeError
    return pair


async def refresh(pool: asyncpg.Pool, settings: Settings, refresh_token: str) -> TokenPair:
    try:
        claims = decode_token(refresh_token, secret=settings.jwt_secret)
    except jwt.PyJWTError as exc:
        raise InvalidRefreshTokenError from exc
    if claims.get("type") != "refresh":
        raise InvalidRefreshTokenError

    tenant_id = UUID(claims["tenant_id"])
    user_id = UUID(claims["sub"])
    session_id = UUID(claims["sid"])

    async with tenant_connection(pool, tenant_id) as conn:
        session = await repository.get_active_refresh_session(conn, session_id, user_id)
        if session is None or not tokens_match(session["token_hash"], hash_token(refresh_token)):
            raise InvalidRefreshTokenError
        await repository.revoke_refresh_session(conn, session_id)

        user = await repository.get_user_by_id(conn, user_id)
        if user is None or not user["is_active"]:
            raise InvalidRefreshTokenError
        return await _issue_token_pair(conn, settings, tenant_id, user_id, user["role_id"], user["totp_enabled"])


async def logout(pool: asyncpg.Pool, settings: Settings, refresh_token: str) -> None:
    try:
        claims = decode_token(refresh_token, secret=settings.jwt_secret)
    except jwt.PyJWTError:
        return
    if claims.get("type") != "refresh":
        return
    async with tenant_connection(pool, UUID(claims["tenant_id"])) as conn:
        await repository.revoke_refresh_session(conn, UUID(claims["sid"]))


async def get_user(pool: asyncpg.Pool, tenant_id: UUID, user_id: UUID):
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.get_user_by_id(conn, user_id)


async def request_password_reset(
    pool: asyncpg.Pool, redis_client: redis.Redis, settings: Settings, identifier: str
) -> None:
    """Always returns None regardless of whether the identifier is
    registered, so the response can't be used to enumerate accounts."""
    identifier = _normalize_identifier(identifier)
    mapping = await _resolve_identifier(pool, identifier)
    if mapping is None:
        return
    tenant_id = mapping["tenant_id"]
    async with tenant_connection(pool, tenant_id) as conn:
        user = await repository.get_user_by_id(conn, mapping["user_id"])
        if user is None:
            return
    token = secrets.token_urlsafe(32)
    ttl = timedelta(minutes=settings.password_reset_token_ttl_minutes)
    await otp_store.set_password_reset_token(redis_client, hash_token(token), tenant_id, user["id"], ttl)
    channel = "email" if mapping["identifier_type"] == "email" else "sms"
    link = None
    if channel == "email":
        query = urlencode({"identifier": identifier, "token": token})
        link = f"{settings.frontend_base_url}/login/reset?{query}"
    await send_code(channel=channel, destination=identifier, code=token, link=link)


async def confirm_password_reset(
    pool: asyncpg.Pool, redis_client: redis.Redis, identifier: str, token: str, new_password: str
) -> None:
    identifier = _normalize_identifier(identifier)
    mapping = await _resolve_identifier(pool, identifier)
    if mapping is None:
        raise InvalidResetTokenError
    tenant_id = mapping["tenant_id"]

    token_hash = hash_token(token)
    row = await otp_store.get_password_reset_token(redis_client, token_hash, tenant_id)
    if row is None:
        raise InvalidResetTokenError

    async with tenant_connection(pool, tenant_id) as conn:
        await repository.update_user_password(conn, row["user_id"], await hash_password(new_password))
        await repository.revoke_all_user_refresh_sessions(conn, row["user_id"])
    await otp_store.consume_password_reset_token(redis_client, token_hash)


async def change_password(
    pool: asyncpg.Pool, tenant_id: UUID, user_id: UUID, current_password: str, new_password: str
) -> None:
    """Self-service password change for an already-authenticated user --
    distinct from the identifier+token forgot-password flow above. Revokes
    every refresh session (including the caller's own) on success, same as
    confirm_password_reset, so a stolen access token can't linger past its
    own TTL while old refresh tokens still work elsewhere."""
    async with tenant_connection(pool, tenant_id) as conn:
        user = await repository.get_user_by_id(conn, user_id)
        if user is None or not await verify_password(current_password, user["password_hash"]):
            raise InvalidCurrentPasswordError
        await repository.update_user_password(conn, user_id, await hash_password(new_password))
        await repository.revoke_all_user_refresh_sessions(conn, user_id)


async def request_otp(pool: asyncpg.Pool, redis_client: redis.Redis, settings: Settings, phone: str) -> None:
    """Always returns None — same no-enumeration reasoning as password reset."""
    phone = phone.strip()
    mapping = await _resolve_identifier(pool, phone)
    if mapping is None or mapping["identifier_type"] != "phone":
        return
    tenant_id = mapping["tenant_id"]
    async with tenant_connection(pool, tenant_id) as conn:
        user = await repository.get_user_by_id(conn, mapping["user_id"])
        if user is None:
            return
    code = f"{secrets.randbelow(1_000_000):06d}"
    ttl = timedelta(minutes=settings.otp_code_ttl_minutes)
    await otp_store.set_otp_code(redis_client, tenant_id, user["id"], hash_token(code), ttl)
    await send_code(channel="sms", destination=phone, code=code)


async def verify_otp(pool: asyncpg.Pool, redis_client: redis.Redis, settings: Settings, phone: str, code: str) -> TokenPair:
    phone = phone.strip()
    mapping = await _resolve_identifier(pool, phone)
    if mapping is None or mapping["identifier_type"] != "phone":
        raise InvalidOtpError
    tenant_id = mapping["tenant_id"]

    async with tenant_connection(pool, tenant_id) as conn:
        user = await repository.get_user_by_id(conn, mapping["user_id"])
        if user is None:
            raise InvalidOtpError

        row = await otp_store.get_otp_code(redis_client, tenant_id, user["id"])
        if row is None or row["attempt_count"] >= settings.otp_max_attempts:
            raise InvalidOtpError
        if not tokens_match(row["code_hash"], hash_token(code)):
            await otp_store.increment_otp_attempt(redis_client, tenant_id, user["id"])
            pair = None
        else:
            await otp_store.consume_otp_code(redis_client, tenant_id, user["id"])
            pair = await _issue_token_pair(conn, settings, tenant_id, user["id"], user["role_id"], user["totp_enabled"])

    if pair is None:
        raise InvalidOtpError
    return pair


async def setup_2fa(pool: asyncpg.Pool, tenant_id: UUID, user_id: UUID) -> TwoFactorSetupOut:
    async with tenant_connection(pool, tenant_id) as conn:
        user = await repository.get_user_by_id(conn, user_id)
        secret = pyotp.random_base32()
        await repository.set_user_totp_secret(conn, user_id, secret)
    uri = pyotp.TOTP(secret).provisioning_uri(name=user["email"] or user["phone"] or str(user_id), issuer_name="Dashboarduz")
    return TwoFactorSetupOut(secret=secret, otpauth_uri=uri)


async def confirm_2fa(pool: asyncpg.Pool, tenant_id: UUID, user_id: UUID, code: str) -> None:
    async with tenant_connection(pool, tenant_id) as conn:
        user = await repository.get_user_by_id(conn, user_id)
        if user is None or not user["totp_secret"]:
            raise TwoFactorNotSetupError
        if not pyotp.TOTP(user["totp_secret"]).verify(code, valid_window=1):
            raise InvalidTwoFactorCodeError
        await repository.enable_user_totp(conn, user_id)


# --- Self-service tenant registration ---------------------------------
#
# Replaces Platform-Admin-provisioned onboarding as the primary path (that
# path -- tenants/service.py's create_tenant + create_tenant_admin_user --
# still exists for support/enterprise use, just isn't how a normal signup
# happens anymore). Three steps: request a code, verify it (proving the
# identifier is real), then complete registration (create the tenant + its
# first admin user, auto-logged in). No Platform Admin, 2FA, or reason
# string involved -- this is the tenant acting on its own behalf.


async def request_registration_code(
    pool: asyncpg.Pool, redis_client: redis.Redis, settings: Settings, identifier: str
) -> None:
    """Unlike login/OTP/password-reset, this deliberately raises
    IdentifierTakenError (-> 409) when the identifier is already registered
    -- telling a signup form "this email/phone is taken" is normal, expected
    UX, not the same account-enumeration risk as probing an existing
    account's login."""
    identifier = _normalize_identifier(identifier)
    identifier_type = _identifier_type(identifier)
    async with platform_connection(pool) as conn:
        if await repository.get_login_identifier(conn, identifier) is not None:
            raise IdentifierTakenError
    code = f"{secrets.randbelow(1_000_000):06d}"
    ttl = timedelta(minutes=settings.otp_code_ttl_minutes)
    await otp_store.set_registration_verification(redis_client, identifier, identifier_type, hash_token(code), ttl)
    channel = "sms" if identifier_type == "phone" else "email"
    await send_code(channel=channel, destination=identifier, code=code)


async def verify_registration_code(
    pool: asyncpg.Pool, redis_client: redis.Redis, settings: Settings, identifier: str, code: str
) -> str:
    """Returns a short-lived registration_pending JWT proving this
    identifier was verified -- consumed by complete_registration."""
    identifier = _normalize_identifier(identifier)
    row = await otp_store.get_registration_verification(redis_client, identifier)
    if row is None or row["attempt_count"] >= settings.otp_max_attempts:
        raise InvalidRegistrationCodeError
    if not tokens_match(row["code_hash"], hash_token(code)):
        await otp_store.increment_registration_verification_attempt(redis_client, identifier)
        raise InvalidRegistrationCodeError
    await otp_store.consume_registration_verification(redis_client, identifier)
    identifier_type = row["identifier_type"]

    return encode_token(
        {"identifier": identifier, "identifier_type": identifier_type, "type": "registration_pending"},
        secret=settings.jwt_secret,
        ttl=timedelta(minutes=settings.two_factor_pending_ttl_minutes),
    )


async def complete_registration(
    pool: asyncpg.Pool, settings: Settings, registration_token: str, company_name: str, slug: str, password: str
) -> TokenPair:
    try:
        claims = decode_token(registration_token, secret=settings.jwt_secret)
    except jwt.PyJWTError as exc:
        raise InvalidRegistrationTokenError from exc
    if claims.get("type") != "registration_pending":
        raise InvalidRegistrationTokenError

    identifier = claims["identifier"]
    identifier_type = claims["identifier_type"]
    email = identifier if identifier_type == "email" else None
    phone = identifier if identifier_type == "phone" else None

    async with platform_connection(pool) as conn:
        if await repository.get_login_identifier(conn, identifier) is not None:
            # Race window between verify and complete (or a retried
            # request), or a second complete_registration call with an
            # already-consumed identifier -- same "already registered"
            # outcome either way.
            raise IdentifierTakenError
        tenant = await tenants_repository.insert_tenant(conn, company_name, slug)
        if tenant is None:
            raise TenantSlugTakenError
    tenant_id = tenant["id"]

    # tenants.trial_ends_at defaults to now() + 15 days at the DB level
    # (0020_self_registration.sql) -- nothing else to do here to start the
    # trial. Payment (skip-the-trial path) is a separate, already-existing
    # flow: POST /api/v1/billing/payments/initiate, called by the frontend
    # right after this returns tokens, if the user chose to pay immediately
    # instead of using the trial.
    role_ids = await roles_service.seed_default_roles(pool, tenant_id)
    password_hash = await hash_password(password)

    async with tenant_connection(pool, tenant_id) as conn:
        user = await repository.insert_user_with_identifiers(
            conn, tenant_id, email, phone, password_hash, role_ids["admin"]
        )
        return await _issue_token_pair(conn, settings, tenant_id, user["id"], user["role_id"], False)
