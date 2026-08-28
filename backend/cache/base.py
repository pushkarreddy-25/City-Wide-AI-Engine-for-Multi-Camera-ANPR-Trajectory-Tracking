"""Cache interface shared by the in-memory and Redis implementations.

Values are plain JSON-serializable Python objects; implementations handle any
serialization internally so callers never see the difference.
"""
from abc import ABC, abstractmethod
from typing import Any, List, Optional


class BaseCache(ABC):
    @abstractmethod
    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Store a value under ``key`` with optional TTL in seconds."""

    @abstractmethod
    def get(self, key: str) -> Any:
        """Return the value for ``key`` or ``None`` if missing/expired."""

    @abstractmethod
    def delete(self, key: str) -> None:
        """Remove ``key``."""

    @abstractmethod
    def push(self, key: str, value: Any, maxlen: Optional[int] = None) -> None:
        """Prepend ``value`` to a list (newest first), trimming to ``maxlen``."""

    @abstractmethod
    def range(self, key: str, start: int = 0, end: int = -1) -> List[Any]:
        """Return list items from ``start`` to ``end`` (inclusive, Redis-style)."""

    @abstractmethod
    def clear(self) -> None:
        """Remove everything (used by tests)."""
