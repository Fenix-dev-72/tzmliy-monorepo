"""Pure-ASGI middleware (no BaseHTTPMiddleware: it re-buffers responses and
interferes with the analytics SSE stream) for the security hardening pass:
per-IP rate limiting on credential/webhook/general-API endpoints and standard
security response headers.

optimize.md #11 (2026-07-14): the limiter used to be in-memory and
per-process — fine for one instance, but silently weaker once this repo runs
more than one app process/VPS (each process would count its own separate
quota). Now backed by Redis (a sliding-window log per key, using the same
`app.state.redis` connection the rest of the app already shares — accessed via
`scope["app"]`, which Starlette populates on every request scope), so the
limit holds across however many app processes are running.

2026-07-17: added a third, generous "general" bucket covering every other
`/api/v1`/`/platform/v1` route -- relying on the auth bucket alone only
guards against credential guessing, not a valid (or stolen) JWT being used
to flood business endpoints.
"""

import time
from uuid import uuid4

from app.core.config import Settings

# Endpoints where a request is a credential guess (password, TOTP, OTP,
# reset token). Kept deliberately narrow: business endpoints are already
# behind JWT auth, and blanket-limiting them would punish legitimate bursts.
_AUTH_PATHS = (
    "/api/v1/auth/login",
    "/api/v1/auth/refresh",
    "/api/v1/auth/otp/",
    "/api/v1/auth/password-reset/",
    "/api/v1/auth/2fa/verify-login",
    "/platform/v1/auth/login",
    "/platform/v1/auth/refresh",
    "/platform/v1/auth/2fa/verify-login",
    "/api/v1/dashboard-sessions/login",
)

# Unauthenticated-by-JWT webhook ingestion (signature is the auth). Higher
# limit: providers legitimately burst, but an unbounded firehose from one IP
# is still a cheap DoS on signature verification.
_WEBHOOK_PATHS = (
    "/api/v1/calls/webhooks/",
    "/api/v1/billing/webhooks/",
    "/api/v1/crm/webhooks/",
)

# Every other real API route (2026-07-17) -- everything under these two
# prefixes that isn't already an auth or webhook path above falls into the
# general bucket instead of going completely unlimited. Being behind a valid
# JWT stops credential-guessing but not a compromised/leaked token (or a
# buggy script) from hammering business endpoints -- that's still a real
# denial-of-service risk this repo had no answer for until now.
_GENERAL_API_PATHS = ("/api/v1/", "/platform/v1/")

class SlidingWindowLimiter:
    """Redis-backed sliding-window-log limiter: one ZSET per (name, key),
    member=unique-per-request, score=request time. Not wrapped in a single
    atomic Lua script -- a request landing exactly at the boundary between
    the ZCARD read and the ZADD write could in rare cases slip through by one,
    same order-of-magnitude looseness the old in-memory version already had
    (it was never meant to be a hard, provably-exact limiter, just a
    brute-force speed bump); the important fix here is that the count is now
    shared across every app process instead of counted separately per-process."""

    def __init__(self, name: str, max_requests: int, window_seconds: float) -> None:
        self.name = name
        self.max_requests = max_requests
        self.window_seconds = window_seconds

    async def check(self, redis_client, key: str) -> tuple[bool, float]:
        """Returns (allowed, retry_after_seconds)."""
        redis_key = f"ratelimit:{self.name}:{key}"
        now = time.time()
        cutoff = now - self.window_seconds
        await redis_client.zremrangebyscore(redis_key, 0, cutoff)
        count = await redis_client.zcard(redis_key)
        if count >= self.max_requests:
            oldest = await redis_client.zrange(redis_key, 0, 0, withscores=True)
            retry_after = (oldest[0][1] + self.window_seconds - now) if oldest else self.window_seconds
            return False, max(retry_after, 1.0)
        await redis_client.zadd(redis_key, {f"{now}:{uuid4()}": now})
        await redis_client.expire(redis_key, int(self.window_seconds) + 1)
        return True, 0.0


class RateLimitMiddleware:
    def __init__(self, app, settings: Settings) -> None:
        self.app = app
        self.settings = settings
        self._auth_limiter = SlidingWindowLimiter(
            "auth", settings.rate_limit_auth_requests, settings.rate_limit_auth_window_seconds
        )
        self._webhook_limiter = SlidingWindowLimiter(
            "webhook", settings.rate_limit_webhook_requests, settings.rate_limit_webhook_window_seconds
        )
        self._general_limiter = SlidingWindowLimiter(
            "general", settings.rate_limit_general_requests, settings.rate_limit_general_window_seconds
        )

    def _client_ip(self, scope) -> str:
        if self.settings.trust_x_forwarded_for:
            for name, value in scope.get("headers", []):
                if name == b"x-forwarded-for":
                    # Leftmost hop the trusted proxy recorded = original client.
                    return value.decode("latin-1").split(",")[0].strip()
        client = scope.get("client")
        return client[0] if client else "unknown"

    def _limiter_for(self, path: str) -> SlidingWindowLimiter | None:
        if path.startswith(_AUTH_PATHS):
            return self._auth_limiter
        if path.startswith(_WEBHOOK_PATHS):
            return self._webhook_limiter
        if path.startswith(_GENERAL_API_PATHS):
            return self._general_limiter
        return None

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http" or not self.settings.rate_limit_enabled:
            await self.app(scope, receive, send)
            return
        limiter = self._limiter_for(scope["path"])
        if limiter is None:
            await self.app(scope, receive, send)
            return
        # scope["app"] is the top-level FastAPI app (Starlette sets this on
        # every request scope) -- reuses the same Redis connection app.state
        # already holds (created once in main.py's lifespan), rather than
        # opening a second pool just for this middleware.
        redis_client = scope["app"].state.redis
        allowed, retry_after = await limiter.check(redis_client, self._client_ip(scope))
        if allowed:
            await self.app(scope, receive, send)
            return
        body = b'{"detail":"Too many requests"}'
        await send(
            {
                "type": "http.response.start",
                "status": 429,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode()),
                    (b"retry-after", str(int(retry_after) + 1).encode()),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})


class SecurityHeadersMiddleware:
    """OWASP-recommended response headers. HSTS is only added outside
    development — sending it over plain-HTTP local dev would make browsers
    refuse http://localhost for months."""

    def __init__(self, app, settings: Settings) -> None:
        self.app = app
        self._extra_headers = [
            (b"x-content-type-options", b"nosniff"),
            (b"x-frame-options", b"DENY"),
            (b"referrer-policy", b"strict-origin-when-cross-origin"),
        ]
        if settings.app_env != "development":
            self._extra_headers.append((b"strict-transport-security", b"max-age=31536000; includeSubDomains"))

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message) -> None:
            if message["type"] == "http.response.start":
                message = {**message, "headers": list(message.get("headers", [])) + self._extra_headers}
            await send(message)

        await self.app(scope, receive, send_with_headers)
