import redis.asyncio as redis

from app.core.config import Settings


async def create_redis_pool(settings: Settings) -> redis.Redis:
    return redis.from_url(settings.redis_url, decode_responses=True)
