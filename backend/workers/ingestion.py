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
        import cv2
        import os
        from datetime import datetime
        from utils.config import get_anpr_config
        
        video_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static", "sample_traffic.mp4")
        cap = None
        
        while not self._stop.is_set():
            # Dynamically check config to see if we are in production
            config = get_anpr_config()
            is_production = config.get("detection", {}).get("engine") != "mock"
            
            if is_production and os.path.exists(video_path):
                if cap is None or not cap.isOpened():
                    cap = cv2.VideoCapture(video_path)
                    
                # Read frame if queue is relatively empty (backpressure control)
                if self.queue.qsize() < 3:
                    ret, frame = cap.read()
                    if not ret:
                        # Loop video
                        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        ret, frame = cap.read()
                        
                    if ret:
                        # Use first available camera for demo
                        cam_id = list(config.get("cameras", {"cam_mg_road": 1}).keys())[0]
                        self.emit_frame(cam_id, frame, timestamp=datetime.now())
                        
                # Yield CPU to allow YOLO processing to catch up (simulate ~3 FPS)
                time.sleep(0.33)
            else:
                if cap is not None:
                    cap.release()
                    cap = None
                time.sleep(1.0)
                
        if cap is not None:
            cap.release()
