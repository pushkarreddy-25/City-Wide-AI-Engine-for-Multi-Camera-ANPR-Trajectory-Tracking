import queue
import threading
from collections import defaultdict
from typing import Any, Callable, DefaultDict, Dict, List, Optional


class EventBus:
    """Small in-process pub/sub bus for explicit event-driven pipeline stages."""

    def __init__(self):
        self._subscribers: DefaultDict[str, List[Callable[[Dict[str, Any]], None]]] = defaultdict(list)
        self._lock = threading.RLock()

    def subscribe(self, event_type: str, handler: Callable[[Dict[str, Any]], None]) -> None:
        with self._lock:
            self._subscribers[event_type].append(handler)

    def publish(self, event_type: str, payload: Dict[str, Any]) -> None:
        with self._lock:
            handlers = list(self._subscribers.get(event_type, ()))
        for handler in handlers:
            handler(payload)


class JobQueue:
    """Simple queue boundary between ingestion workers and processing workers."""

    def __init__(self):
        self._queue = queue.Queue()

    def put(self, job: Dict[str, Any]) -> None:
        self._queue.put(job)

    def get(self, timeout: Optional[float] = None) -> Optional[Dict[str, Any]]:
        try:
            return self._queue.get(timeout=timeout)
        except queue.Empty:
            return None

    def task_done(self) -> None:
        self._queue.task_done()
