import redis.asyncio as redis

from app.core.config import Settings


async def create_redis_pool(settings: Settings) -> redis.Redis:
    """`redis.from_url` alone backs the client with a plain, *unbounded*
    ConnectionPool -- fine at low concurrency, but a burst of thousands of
    concurrent requests (RateLimitMiddleware calls this client on every
    /auth/login) each try to open their own brand-new TCP connection at once
    instead of queueing for a shared one. Measured 2026-07-14: 2500 concurrent
    logins produced widespread `redis.exceptions.TimeoutError: Timeout
    connecting to server` -> 500s, not just slow responses. A bounded
    BlockingConnectionPool makes extra requests queue for a free connection
    (up to `redis_pool_timeout_seconds`) instead of each hammering a fresh
    socket."""
    pool = redis.BlockingConnectionPool.from_url(
        settings.redis_url,
        decode_responses=True,
        max_connections=settings.redis_pool_max_connections,
        timeout=settings.redis_pool_timeout_seconds,
    )
    return redis.Redis(connection_pool=pool)
