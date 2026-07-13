import json
import logging
from typing import Any

import redis.asyncio as redis

logger = logging.getLogger("dashboarduz.cache")

_KEY_PREFIX = "dashboarduz:cache:"


class RedisCache:
    def __init__(self, client: redis.Redis, default_ttl: int = 300) -> None:
        self._client = client
        self._default_ttl = default_ttl

    def _key(self, name: str) -> str:
        return f"{_KEY_PREFIX}{name}"

    async def get(self, name: str) -> Any | None:
        raw = await self._client.get(self._key(name))
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            logger.warning("cache.get: invalid JSON for key=%s", name)
            return None

    async def set(self, name: str, value: Any, ttl: int | None = None) -> None:
        ttl = ttl if ttl is not None else self._default_ttl
        try:
            raw = json.dumps(value, default=str)
        except (TypeError, ValueError):
            logger.warning("cache.set: non-serializable value for key=%s", name)
            return
        await self._client.set(self._key(name), raw, ex=ttl)

    async def delete(self, name: str) -> None:
        await self._client.delete(self._key(name))

    async def delete_pattern(self, pattern: str) -> int:
        full_pattern = self._key(pattern)
        keys = []
        async for key in self._client.scan_iter(match=full_pattern):
            keys.append(key)
        if keys:
            return await self._client.delete(*keys)
        return 0

    async def exists(self, name: str) -> bool:
        return bool(await self._client.exists(self._key(name)))

    async def incr(self, name: str, amount: int = 1) -> int:
        return await self._client.incrby(self._key(name), amount)

    async def expire(self, name: str, ttl: int) -> None:
        await self._client.expire(self._key(name), ttl)

    async def get_int(self, name: str) -> int | None:
        raw = await self._client.get(self._key(name))
        if raw is None:
            return None
        try:
            return int(raw)
        except (TypeError, ValueError):
            return None

    async def set_int(self, name: str, value: int, ttl: int | None = None) -> None:
        ttl = ttl if ttl is not None else self._default_ttl
        await self._client.set(self._key(name), str(value), ex=ttl)

    async def hset(self, name: str, field: str, value: Any) -> None:
        try:
            raw = json.dumps(value, default=str)
        except (TypeError, ValueError):
            return
        await self._client.hset(self._key(name), field, raw)

    async def hget(self, name: str, field: str) -> Any | None:
        raw = await self._client.hget(self._key(name), field)
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return None

    async def hgetall(self, name: str) -> dict[str, Any]:
        raw = await self._client.hgetall(self._key(name))
        result = {}
        for field, value in raw.items():
            try:
                result[field] = json.loads(value)
            except (json.JSONDecodeError, TypeError):
                result[field] = value
        return result

    async def hdel(self, name: str, *fields: str) -> None:
        if fields:
            await self._client.hdel(self._key(name), *fields)

    async def ttl(self, name: str) -> int:
        return await self._client.ttl(self._key(name))
