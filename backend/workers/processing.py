import threading
import time
from typing import Any, Dict, Optional

from core.events import EventBus, JobQueue
from db import repository
from db.database import SessionLocal
from simulation.pipeline import ProcessingPipeline


class ProcessingWorker:
    """Consumes queued frame jobs, processes them, and persists the results."""

    def __init__(self, queue: Optional[JobQueue] = None, event_bus: Optional[EventBus] = None,
                 pipeline: Optional[ProcessingPipeline] = None):
        self.queue = queue or JobQueue()
        self.event_bus = event_bus or EventBus()
        self.pipeline = pipeline or ProcessingPipeline()
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self):
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=1)

    def _run(self):
        while not self._stop.is_set():
            job = self.queue.get(timeout=0.25)
            if job is None:
                continue
            try:
                payload = job.get("payload", {})
                camera_id = payload.get("camera_id")
                frame = payload.get("frame")
                if camera_id is None or frame is None:
                    continue
                with SessionLocal() as db:
                    dets, alerts = self.pipeline.process_frame(
                        db,
                        camera_id,
                        frame,
                        payload.get("timestamp"),
                        publish=True,
                        track=payload.get("track", True),
                    )
                    db.commit()
                self.event_bus.publish("processing.completed", {
                    "camera_id": camera_id,
                    "detections": dets,
                    "alerts": alerts,
                })
            finally:
                self.queue.task_done()
            time.sleep(0.01)
