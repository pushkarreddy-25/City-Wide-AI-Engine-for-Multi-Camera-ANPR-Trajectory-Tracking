"""Redis-backed cache (production path).

This mirrors ``InMemoryCache`` but persists to Redis and survives across
processes/restarts. It is only imported when ``CACHE_BACKEND=redis``.
Requires ``redis`` (already in requirements) and a running Redis server
(see docker-compose.yml).
"""
import json
import os
from typing import Any, List, Optional

from cache.base import BaseCache


class RedisCache(BaseCache):
    def __init__(self, url: Optional[str] = None):
        import redis  # imported lazily so the package is optional in mock mode
        self._r = redis.Redis.from_url(
            url or os.getenv("REDIS_URL", "redis://localhost:6379/0"),
            decode_responses=True,
        )

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        self._r.set(key, json.dumps(value), ex=ttl)

    def get(self, key: str) -> Any:
        raw = self._r.get(key)
        return json.loads(raw) if raw is not None else None

    def delete(self, key: str) -> None:
        self._r.delete(key)

    def push(self, key: str, value: Any, maxlen: Optional[int] = None) -> None:
        self._r.lpush(key, json.dumps(value))
        if maxlen:
            self._r.ltrim(key, 0, maxlen - 1)

    def range(self, key: str, start: int = 0, end: int = -1) -> List[Any]:
        return [json.loads(x) for x in self._r.lrange(key, start, end)]

    def clear(self) -> None:
        self._r.flushdb()
