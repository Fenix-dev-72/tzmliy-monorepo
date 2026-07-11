"""Ephemeral OTP / password-reset / registration-code storage in Redis.

Was three Postgres tables (otp_codes, password_reset_tokens,
registration_verifications) with a manual expires_at column checked on every
read. Redis's native key TTL does the same job with automatic cleanup -- no
expired-row accumulation, no cron/vacuum needed -- and HINCRBY gives atomic
attempt-counting for free. "Consumed" is now just DELETE instead of a
consumed_at flag: a deleted key can never be read back as valid again, which
is simpler than the old "consumed_at IS NULL AND expires_at > now()" filter
and gets the same replay-safety.

DB index 1 (see Settings.redis_url) plus this "dashboarduz:" key prefix keep
these keys segregated from anything else that might use the same shared
Redis instance.
"""

from datetime import timedelta
from uuid import UUID

import redis.asyncio as redis

_PREFIX = "dashboarduz"


def _otp_key(tenant_id: UUID, user_id: UUID) -> str:
    return f"{_PREFIX}:otp:{tenant_id}:{user_id}"


def _password_reset_key(token_hash: str) -> str:
    return f"{_PREFIX}:pwreset:{token_hash}"


def _registration_verification_key(identifier: str) -> str:
    return f"{_PREFIX}:regverify:{identifier}"


async def set_otp_code(r: redis.Redis, tenant_id: UUID, user_id: UUID, code_hash: str, ttl: timedelta) -> None:
    """Overwrites any code already pending for this user -- a fresh request
    invalidates the old one rather than leaving two "valid" codes around."""
    key = _otp_key(tenant_id, user_id)
    await r.hset(key, mapping={"code_hash": code_hash, "attempt_count": "0"})
    await r.expire(key, ttl)


async def get_otp_code(r: redis.Redis, tenant_id: UUID, user_id: UUID) -> dict | None:
    data = await r.hgetall(_otp_key(tenant_id, user_id))
    if not data:
        return None
    return {"code_hash": data["code_hash"], "attempt_count": int(data["attempt_count"])}


async def increment_otp_attempt(r: redis.Redis, tenant_id: UUID, user_id: UUID) -> None:
    await r.hincrby(_otp_key(tenant_id, user_id), "attempt_count", 1)


async def consume_otp_code(r: redis.Redis, tenant_id: UUID, user_id: UUID) -> None:
    await r.delete(_otp_key(tenant_id, user_id))


async def set_password_reset_token(
    r: redis.Redis, token_hash: str, tenant_id: UUID, user_id: UUID, ttl: timedelta
) -> None:
    key = _password_reset_key(token_hash)
    await r.hset(key, mapping={"tenant_id": str(tenant_id), "user_id": str(user_id)})
    await r.expire(key, ttl)


async def get_password_reset_token(r: redis.Redis, token_hash: str, tenant_id: UUID) -> dict | None:
    data = await r.hgetall(_password_reset_key(token_hash))
    if not data or data["tenant_id"] != str(tenant_id):
        return None
    return {"user_id": UUID(data["user_id"])}


async def consume_password_reset_token(r: redis.Redis, token_hash: str) -> None:
    await r.delete(_password_reset_key(token_hash))


async def set_registration_verification(
    r: redis.Redis, identifier: str, identifier_type: str, code_hash: str, ttl: timedelta
) -> None:
    key = _registration_verification_key(identifier)
    await r.hset(key, mapping={"identifier_type": identifier_type, "code_hash": code_hash, "attempt_count": "0"})
    await r.expire(key, ttl)


async def get_registration_verification(r: redis.Redis, identifier: str) -> dict | None:
    data = await r.hgetall(_registration_verification_key(identifier))
    if not data:
        return None
    return {
        "identifier_type": data["identifier_type"],
        "code_hash": data["code_hash"],
        "attempt_count": int(data["attempt_count"]),
    }


async def increment_registration_verification_attempt(r: redis.Redis, identifier: str) -> None:
    await r.hincrby(_registration_verification_key(identifier), "attempt_count", 1)


async def consume_registration_verification(r: redis.Redis, identifier: str) -> None:
    await r.delete(_registration_verification_key(identifier))
