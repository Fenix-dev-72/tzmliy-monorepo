import asyncio
import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt

JWT_ALGORITHM = "HS256"

# bcrypt hash of a random, discarded string. Verified against when a login
# names a nonexistent account, so "user not found" costs the same wall-clock
# time as "wrong password" — otherwise response timing leaks which emails are
# registered, undoing the deliberate always-204 / generic-401 responses.
_DUMMY_PASSWORD_HASH = "$2b$12$YBfQLouJcL9.GKaw5DHRRe/.5DQxIwVo1YVquFahK6Fr7qKf2hlsa"


def _hash_password_sync(raw: str) -> str:
    return bcrypt.hashpw(raw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_password_sync(raw: str, password_hash: str) -> bool:
    return bcrypt.checkpw(raw.encode("utf-8"), password_hash.encode("utf-8"))


async def hash_password(raw: str) -> str:
    """bcrypt is CPU-bound and synchronous — run off the event loop so one
    password hash doesn't stall every other in-flight request."""
    return await asyncio.to_thread(_hash_password_sync, raw)


async def verify_password(raw: str, password_hash: str) -> bool:
    return await asyncio.to_thread(_verify_password_sync, raw, password_hash)


async def equalize_password_timing(raw: str) -> None:
    """Burn one bcrypt verification against a dummy hash. Call on the
    account-not-found path of every login flow so it takes as long as the
    wrong-password path; the result is meaningless by construction."""
    await asyncio.to_thread(_verify_password_sync, raw, _DUMMY_PASSWORD_HASH)


def tokens_match(expected_hash: str, candidate_hash: str) -> bool:
    """Constant-time comparison for stored token/code hashes (refresh
    sessions, OTP codes, reset tokens) — `==` short-circuits on the first
    differing byte, which is a (mostly theoretical, but free to close)
    timing side channel."""
    return hmac.compare_digest(expected_hash, candidate_hash)


def encode_token(claims: dict[str, Any], *, secret: str, ttl: timedelta) -> str:
    now = datetime.now(timezone.utc)
    payload = {**claims, "iat": now, "exp": now + ttl}
    return jwt.encode(payload, secret, algorithm=JWT_ALGORITHM)


def decode_token(token: str, *, secret: str) -> dict[str, Any]:
    """Raises jwt.PyJWTError (expired, bad signature, malformed) on failure —
    callers turn that into a 401, never a 500."""
    return jwt.decode(token, secret, algorithms=[JWT_ALGORITHM])


def hash_token(token: str) -> str:
    """One-way hash of a refresh JWT for DB storage/lookup, so a leaked DB
    dump doesn't hand out usable refresh tokens."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
