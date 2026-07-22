from datetime import datetime
from pathlib import Path
from uuid import UUID

import aiosql
import asyncpg

_queries = aiosql.from_path(
    Path(__file__).parent / "sql" / "queries.sql", "asyncpg", mandatory_parameters=False
)


def _row(record: asyncpg.Record | None) -> dict | None:
    """aiosql/asyncpg return Record objects, which Pydantic can't validate via
    getattr — repository functions hand back plain dicts so nothing above
    this layer needs to know about asyncpg."""
    return dict(record) if record is not None else None


async def insert_user(
    conn: asyncpg.Connection,
    tenant_id: UUID,
    email: str | None,
    phone: str | None,
    password_hash: str,
    role_id: UUID,
) -> dict | None:
    row = await _queries.insert_user(
        conn, tenant_id=tenant_id, email=email, phone=phone, password_hash=password_hash, role_id=role_id
    )
    return _row(row)


async def insert_login_identifier(
    conn: asyncpg.Connection, identifier: str, identifier_type: str, tenant_id: UUID, user_id: UUID
) -> str | None:
    row = await _queries.insert_login_identifier(
        conn, identifier=identifier, identifier_type=identifier_type, tenant_id=tenant_id, user_id=user_id
    )
    return row["identifier"] if row is not None else None


async def get_login_identifier(conn: asyncpg.Connection, identifier: str) -> dict | None:
    row = await _queries.get_login_identifier(conn, identifier=identifier)
    return _row(row)


async def insert_user_with_identifiers(
    conn: asyncpg.Connection,
    tenant_id: UUID,
    email: str | None,
    phone: str | None,
    password_hash: str,
    role_id: UUID,
) -> dict | None:
    """Keeps `users` and `user_login_identifiers` in sync in one transaction.
    Callers must pre-check phone uniqueness (get_login_identifier) before
    calling this -- see the comment on insert_user's SQL for why. email is
    optional (phone-only registration, 0021_nullable_email.sql) -- only
    write an identifier row for whichever of email/phone is actually set."""
    user = await insert_user(conn, tenant_id, email, phone, password_hash, role_id)
    if user is None:
        return None
    if email:
        await insert_login_identifier(conn, email, "email", tenant_id, user["id"])
    if phone:
        await insert_login_identifier(conn, phone, "phone", tenant_id, user["id"])
    return user


async def get_user_by_email(conn: asyncpg.Connection, tenant_id: UUID, email: str) -> dict | None:
    row = await _queries.get_user_by_email(conn, tenant_id=tenant_id, email=email)
    return _row(row)


async def get_user_by_phone(conn: asyncpg.Connection, tenant_id: UUID, phone: str) -> dict | None:
    row = await _queries.get_user_by_phone(conn, tenant_id=tenant_id, phone=phone)
    return _row(row)


async def get_user_by_id(conn: asyncpg.Connection, user_id: UUID) -> dict | None:
    row = await _queries.get_user_by_id(conn, user_id=user_id)
    return _row(row)


async def record_failed_login(
    conn: asyncpg.Connection, user_id: UUID, max_attempts: int, lockout_minutes: int
) -> dict:
    row = await _queries.record_failed_login(
        conn, user_id=user_id, max_attempts=max_attempts, lockout_minutes=lockout_minutes
    )
    return _row(row)


async def reset_failed_logins(conn: asyncpg.Connection, user_id: UUID) -> None:
    await _queries.reset_failed_logins(conn, user_id=user_id)


async def list_users(conn: asyncpg.Connection, limit: int, offset: int) -> list[dict]:
    rows = [row async for row in _queries.list_users(conn, limit=limit, offset=offset)]
    return [dict(r) for r in rows]


async def update_user_profile(
    conn: asyncpg.Connection, user_id: UUID, full_name: str | None, phone: str | None
) -> dict | None:
    row = await _queries.update_user_profile(conn, user_id=user_id, full_name=full_name, phone=phone)
    return _row(row)


async def delete_login_identifier_by_user_and_type(
    conn: asyncpg.Connection, user_id: UUID, identifier_type: str
) -> None:
    await _queries.delete_login_identifier_by_user_and_type(conn, user_id=user_id, identifier_type=identifier_type)


async def update_user_role(conn: asyncpg.Connection, user_id: UUID, role_id: UUID) -> None:
    await _queries.update_user_role(conn, user_id=user_id, role_id=role_id)


async def deactivate_user(conn: asyncpg.Connection, user_id: UUID) -> None:
    await _queries.deactivate_user(conn, user_id=user_id)


async def update_user_password(conn: asyncpg.Connection, user_id: UUID, password_hash: str) -> None:
    await _queries.update_user_password(conn, user_id=user_id, password_hash=password_hash)


async def set_user_totp_secret(conn: asyncpg.Connection, user_id: UUID, totp_secret: str) -> None:
    await _queries.set_user_totp_secret(conn, user_id=user_id, totp_secret=totp_secret)


async def enable_user_totp(conn: asyncpg.Connection, user_id: UUID) -> None:
    await _queries.enable_user_totp(conn, user_id=user_id)


async def set_telegram_link_token(conn: asyncpg.Connection, user_id: UUID, token_hash: str, expires_at) -> None:
    await _queries.set_telegram_link_token(conn, user_id=user_id, token_hash=token_hash, expires_at=expires_at)


async def get_user_by_telegram_link_token(conn: asyncpg.Connection, tenant_id: UUID, token_hash: str) -> dict | None:
    row = await _queries.get_user_by_telegram_link_token(conn, tenant_id=tenant_id, token_hash=token_hash)
    return dict(row) if row is not None else None


async def set_telegram_chat_id(conn: asyncpg.Connection, user_id: UUID, telegram_chat_id: int) -> None:
    await _queries.set_telegram_chat_id(conn, user_id=user_id, telegram_chat_id=telegram_chat_id)


async def user_has_telegram_chat_id(conn: asyncpg.Connection, user_id: UUID) -> bool:
    row = await _queries.user_has_telegram_chat_id(conn, user_id=user_id)
    return row["exists"]


async def insert_refresh_session(
    conn: asyncpg.Connection,
    session_id: UUID,
    tenant_id: UUID,
    user_id: UUID,
    token_hash: str,
    expires_at: datetime,
) -> dict:
    row = await _queries.insert_refresh_session(
        conn, id=session_id, tenant_id=tenant_id, user_id=user_id, token_hash=token_hash, expires_at=expires_at
    )
    return _row(row)


async def get_active_refresh_session(conn: asyncpg.Connection, session_id: UUID, user_id: UUID) -> dict | None:
    row = await _queries.get_active_refresh_session(conn, session_id=session_id, user_id=user_id)
    return _row(row)


async def revoke_refresh_session(conn: asyncpg.Connection, session_id: UUID) -> None:
    await _queries.revoke_refresh_session(conn, session_id=session_id)


async def revoke_all_user_refresh_sessions(conn: asyncpg.Connection, user_id: UUID) -> None:
    await _queries.revoke_all_user_refresh_sessions(conn, user_id=user_id)


# Password-reset tokens, phone-OTP codes, and registration-verification
# codes moved to Redis (see otp_store.py) -- they were always ephemeral,
# TTL-bound data, and Redis's native expiry does that job better than a
# manually-checked expires_at column ever did.
