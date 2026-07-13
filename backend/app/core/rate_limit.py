import logging
import time

import redis.asyncio as redis

from app.core.config import Settings

logger = logging.getLogger("dashboarduz.ratelimit")

_AUTH_PATHS = (
    "/api/v1/auth/login",
    "/api/v1/auth/refresh",
    "/api/v1/auth/otp/",
    "/api/v1/auth/password-reset/",
    "/api/v1/auth/2fa/verify-login",
    "/api/v1/auth/register/",
    "/platform/v1/auth/login",
    "/platform/v1/auth/refresh",
    "/platform/v1/auth/2fa/verify-login",
    "/api/v1/dashboard-sessions/login",
)

_WEBHOOK_PATHS = (
    "/api/v1/calls/webhooks/",
    "/api/v1/billing/webhooks/",
    "/api/v1/crm/webhooks/",
)

_GENERAL_PATHS = (
    "/api/v1/",
    "/platform/v1/",
)


class RedisSlidingWindowLimiter:
    def __init__(self, client: redis.Redis, max_requests: int, window_seconds: int, key_prefix: str) -> None:
        self._client = client
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._key_prefix = key_prefix

    async def check(self, key: str) -> tuple[bool, float]:
        now = time.time()
        redis_key = f"{self._key_prefix}:{key}"
        window_start = now - self.window_seconds

        pipe = self._client.pipeline()
        pipe.zremrangebyscore(redis_key, 0, window_start)
        pipe.zadd(redis_key, {str(now): now})
        pipe.zcard(redis_key)
        pipe.expire(redis_key, self.window_seconds + 1)
        results = await pipe.execute()

        count = results[2]
        if count > self.max_requests:
            await self._client.zrem(redis_key, str(now))
            oldest = await self._client.zrange(redis_key, 0, 0, withscores=True)
            if oldest:
                retry_after = oldest[0][1] + self.window_seconds - now
                return False, max(retry_after, 1.0)
            return False, float(self.window_seconds)

        return True, 0.0


class InMemorySlidingWindowLimiter:
    def __init__(self, max_requests: int, window_seconds: float) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: dict[str, list[float]] = {}
        self._last_sweep = time.monotonic()

    def check(self, key: str) -> tuple[bool, float]:
        now = time.monotonic()
        self._maybe_sweep(now)
        window = self._hits.setdefault(key, [])
        cutoff = now - self.window_seconds
        while window and window[0] <= cutoff:
            window.pop(0)
        if len(window) >= self.max_requests:
            return False, max(window[0] + self.window_seconds - now, 1.0)
        window.append(now)
        return True, 0.0

    def _maybe_sweep(self, now: float) -> None:
        if now - self._last_sweep < 300.0:
            return
        self._last_sweep = now
        cutoff = now - self.window_seconds
        stale = [key for key, window in self._hits.items() if not window or window[-1] <= cutoff]
        for key in stale:
            del self._hits[key]


class DistributedRateLimitMiddleware:
    def __init__(self, app, settings: Settings, redis_client: redis.Redis | None = None) -> None:
        self.app = app
        self.settings = settings
        self._use_redis = redis_client is not None

        if self._use_redis:
            self._auth_limiter = RedisSlidingWindowLimiter(
                redis_client,
                settings.rate_limit_auth_requests,
                settings.rate_limit_auth_window_seconds,
                "dashboarduz:ratelimit:auth",
            )
            self._webhook_limiter = RedisSlidingWindowLimiter(
                redis_client,
                settings.rate_limit_webhook_requests,
                settings.rate_limit_webhook_window_seconds,
                "dashboarduz:ratelimit:webhook",
            )
            self._general_limiter = RedisSlidingWindowLimiter(
                redis_client,
                settings.rate_limit_general_requests,
                settings.rate_limit_general_window_seconds,
                "dashboarduz:ratelimit:general",
            )
        else:
            self._auth_limiter_mem = InMemorySlidingWindowLimiter(
                settings.rate_limit_auth_requests, settings.rate_limit_auth_window_seconds
            )
            self._webhook_limiter_mem = InMemorySlidingWindowLimiter(
                settings.rate_limit_webhook_requests, settings.rate_limit_webhook_window_seconds
            )
            self._general_limiter_mem = InMemorySlidingWindowLimiter(
                settings.rate_limit_general_requests, settings.rate_limit_general_window_seconds
            )

    def _client_ip(self, scope) -> str:
        if self.settings.trust_x_forwarded_for:
            for name, value in scope.get("headers", []):
                if name == b"x-forwarded-for":
                    return value.decode("latin-1").split(",")[0].strip()
        client = scope.get("client")
        return client[0] if client else "unknown"

    def _limiter_type(self, path: str) -> str:
        if path.startswith(_AUTH_PATHS):
            return "auth"
        if path.startswith(_WEBHOOK_PATHS):
            return "webhook"
        if path.startswith(_GENERAL_PATHS):
            return "general"
        return "none"

    async def _check_rate_limit(self, limiter_type: str, ip: str) -> tuple[bool, float]:
        if self._use_redis:
            if limiter_type == "auth":
                return await self._auth_limiter.check(ip)
            elif limiter_type == "webhook":
                return await self._webhook_limiter.check(ip)
            elif limiter_type == "general":
                return await self._general_limiter.check(ip)
        else:
            if limiter_type == "auth":
                return self._auth_limiter_mem.check(ip)
            elif limiter_type == "webhook":
                return self._webhook_limiter_mem.check(ip)
            elif limiter_type == "general":
                return self._general_limiter_mem.check(ip)
        return True, 0.0

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http" or not self.settings.rate_limit_enabled:
            await self.app(scope, receive, send)
            return

        path = scope["path"]
        limiter_type = self._limiter_type(path)
        if limiter_type == "none":
            await self.app(scope, receive, send)
            return

        allowed, retry_after = await self._check_rate_limit(limiter_type, self._client_ip(scope))
        if allowed:
            await self.app(scope, receive, send)
            return

        body = b'{"detail":"Too many requests","retry_after":' + str(int(retry_after) + 1).encode() + b'}'
        await send({
            "type": "http.response.start",
            "status": 429,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode()),
                (b"retry-after", str(int(retry_after) + 1).encode()),
                (b"x-ratelimit-limit", str(self._get_limit(limiter_type)).encode()),
                (b"x-ratelimit-remaining", b"0"),
            ],
        })
        await send({"type": "http.response.body", "body": body})

    def _get_limit(self, limiter_type: str) -> int:
        if limiter_type == "auth":
            return self.settings.rate_limit_auth_requests
        elif limiter_type == "webhook":
            return self.settings.rate_limit_webhook_requests
        return self.settings.rate_limit_general_requests
