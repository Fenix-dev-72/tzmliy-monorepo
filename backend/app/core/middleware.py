"""Pure-ASGI middleware (no BaseHTTPMiddleware: it re-buffers responses and
interferes with the analytics SSE stream) for the security hardening pass:
per-IP rate limiting on credential/webhook endpoints and standard security
response headers.

The limiter is in-memory and per-process — right for a single app instance,
but the two-VPS layout planned in Faza 13 needs a shared Redis/Valkey-backed
limiter instead (the TZ already earmarks Redis for rate limiting). Swap the
storage inside SlidingWindowLimiter when that lands; the middleware and
route-classification logic stay as-is.
"""

import time
from collections import deque

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

# Sweep the per-IP bookkeeping this often so one-off IPs don't accumulate
# forever (each entry is tiny, but "grows without bound" is still a leak).
_SWEEP_INTERVAL_SECONDS = 300.0


class SlidingWindowLimiter:
    def __init__(self, max_requests: int, window_seconds: float) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = {}
        self._last_sweep = time.monotonic()

    def check(self, key: str) -> tuple[bool, float]:
        """Returns (allowed, retry_after_seconds). Single-threaded within the
        event loop, so no locking needed."""
        now = time.monotonic()
        self._maybe_sweep(now)
        window = self._hits.setdefault(key, deque())
        cutoff = now - self.window_seconds
        while window and window[0] <= cutoff:
            window.popleft()
        if len(window) >= self.max_requests:
            return False, max(window[0] + self.window_seconds - now, 1.0)
        window.append(now)
        return True, 0.0

    def _maybe_sweep(self, now: float) -> None:
        if now - self._last_sweep < _SWEEP_INTERVAL_SECONDS:
            return
        self._last_sweep = now
        cutoff = now - self.window_seconds
        stale = [key for key, window in self._hits.items() if not window or window[-1] <= cutoff]
        for key in stale:
            del self._hits[key]


class RateLimitMiddleware:
    def __init__(self, app, settings: Settings) -> None:
        self.app = app
        self.settings = settings
        self._auth_limiter = SlidingWindowLimiter(
            settings.rate_limit_auth_requests, settings.rate_limit_auth_window_seconds
        )
        self._webhook_limiter = SlidingWindowLimiter(
            settings.rate_limit_webhook_requests, settings.rate_limit_webhook_window_seconds
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
        return None

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http" or not self.settings.rate_limit_enabled:
            await self.app(scope, receive, send)
            return
        limiter = self._limiter_for(scope["path"])
        if limiter is None:
            await self.app(scope, receive, send)
            return
        allowed, retry_after = limiter.check(self._client_ip(scope))
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
