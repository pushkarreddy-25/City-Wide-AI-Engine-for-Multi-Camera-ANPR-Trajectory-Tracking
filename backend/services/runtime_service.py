from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from core.events import EventBus, JobQueue
from workers.ingestion import CameraIngestionWorker
from workers.processing import ProcessingWorker


@dataclass
class RuntimeServices:
    event_bus: EventBus = field(default_factory=EventBus)
    job_queue: JobQueue = field(default_factory=JobQueue)
    ingestion_worker: CameraIngestionWorker = field(init=False)
    processing_worker: ProcessingWorker = field(init=False)
    started: bool = False

    def __post_init__(self):
        self.ingestion_worker = CameraIngestionWorker(queue=self.job_queue)
        self.processing_worker = ProcessingWorker(queue=self.job_queue, event_bus=self.event_bus)

    def start(self):
        if self.started:
            return
        self.ingestion_worker.start()
        self.processing_worker.start()
        self.started = True

    def stop(self):
        if not self.started:
            return
        self.processing_worker.stop()
        self.ingestion_worker.stop()
        self.started = False

    def emit_frame(self, camera_id: str, frame, **metadata):
        self.ingestion_worker.emit_frame(camera_id, frame, **metadata)


runtime_services = RuntimeServices()
