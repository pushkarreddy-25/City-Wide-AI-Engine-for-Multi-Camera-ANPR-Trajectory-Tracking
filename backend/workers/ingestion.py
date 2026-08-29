import threading
import time
from typing import Any, Dict, Optional

from core.events import JobQueue


class CameraIngestionWorker:
    """Consumes camera feeds and emits normalized frame jobs to the queue."""

    def __init__(self, queue: Optional[JobQueue] = None, poll_interval: float = 0.2):
        self.queue = queue or JobQueue()
        self.poll_interval = poll_interval
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

    def emit_frame(self, camera_id: str, frame: Any, **metadata):
        self.queue.put({
            "type": "camera.frame",
            "payload": {"camera_id": camera_id, "frame": frame, **metadata},
        })

    def _run(self):
        while not self._stop.is_set():
            time.sleep(self.poll_interval)
