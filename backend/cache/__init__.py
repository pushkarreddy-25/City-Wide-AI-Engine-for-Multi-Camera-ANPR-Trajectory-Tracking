"""Cache backend abstraction.

The dashboard reads live positions, heatmaps and recent alerts from a cache
that is updated by the processing pipeline. In production this is Redis
(architecture doc); for zero-setup local runs it is an in-process store with
the same interface.

Select the backend with the ``CACHE_BACKEND`` environment variable
(``memory`` default, or ``redis``).
"""
import os

from cache.memory_cache import InMemoryCache

_cache = None


def get_cache():
    """Return the process-wide cache singleton."""
    global _cache
    if _cache is None:
        backend = os.getenv("CACHE_BACKEND", "memory").lower()
        if backend == "redis":
            from cache.redis_cache import RedisCache
            _cache = RedisCache()
        else:
            _cache = InMemoryCache()
    return _cache
