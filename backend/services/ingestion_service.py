from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Optional

from core.events import EventBus, JobQueue


@dataclass
class IngestionService:
    """Ingestion boundary: normalizes raw camera events before queueing them."""

    event_bus: EventBus = field(default_factory=EventBus)
    job_queue: JobQueue = field(default_factory=JobQueue)

    def receive_frame(self, camera_id: str, frame: Any, **metadata):
        self.job_queue.put({
            "type": "camera.frame",
            "payload": {"camera_id": camera_id, "frame": frame, **metadata},
        })
        self.event_bus.publish("camera.frame.received", {"camera_id": camera_id, **metadata})
