from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

from core.events import EventBus


@dataclass
class PipelineEvent:
    event_type: str
    payload: Dict[str, Any]


class Pipeline:
    """Explicitly event-driven orchestration layer for ingestion → processing → storage → presentation."""

    def __init__(self, event_bus: Optional[EventBus] = None):
        self.event_bus = event_bus or EventBus()
        self._handlers: Dict[str, List[Callable[[Dict[str, Any]], None]]] = {}

    def subscribe(self, event_type: str, handler: Callable[[Dict[str, Any]], None]):
        self.event_bus.subscribe(event_type, handler)
        self._handlers.setdefault(event_type, []).append(handler)

    def publish(self, event_type: str, payload: Dict[str, Any]):
        self.event_bus.publish(event_type, payload)

    def dispatch(self, event_type: str, payload: Dict[str, Any]):
        self.publish(event_type, payload)
