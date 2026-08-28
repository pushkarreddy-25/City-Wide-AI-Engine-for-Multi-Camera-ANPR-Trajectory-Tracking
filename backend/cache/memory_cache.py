"""Thread-safe in-process cache implementing the Redis-style interface."""
import threading
import time
from collections import deque
from typing import Any, List, Optional

from cache.base import BaseCache


class InMemoryCache(BaseCache):
    def __init__(self):
        self._values = {}      # key -> value
        self._expiry = {}      # key -> epoch seconds (or None)
        self._lists = {}       # key -> deque
        self._lock = threading.RLock()

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        with self._lock:
            self._values[key] = value
            self._expiry[key] = (time.time() + ttl) if ttl else None

    def get(self, key: str) -> Any:
        with self._lock:
            exp = self._expiry.get(key)
            if exp is not None and time.time() > exp:
                self._values.pop(key, None)
                self._expiry.pop(key, None)
                return None
            return self._values.get(key)

    def delete(self, key: str) -> None:
        with self._lock:
            self._values.pop(key, None)
            self._expiry.pop(key, None)
            self._lists.pop(key, None)

    def push(self, key: str, value: Any, maxlen: Optional[int] = None) -> None:
        with self._lock:
            dq = self._lists.setdefault(key, deque())
            dq.appendleft(value)
            if maxlen:
                while len(dq) > maxlen:
                    dq.pop()

    def range(self, key: str, start: int = 0, end: int = -1) -> List[Any]:
        with self._lock:
            items = list(self._lists.get(key, deque()))
        if end == -1:
            end = len(items) - 1
        return items[start:end + 1]

    def clear(self) -> None:
        with self._lock:
            self._values.clear()
            self._expiry.clear()
            self._lists.clear()
