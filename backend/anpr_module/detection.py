"""Vehicle detection: mock (simulation) and real YOLOv8 implementations."""
import random
from typing import List, Optional

from anpr_module.base import BaseDetector


class MockDetector(BaseDetector):
    """Simulates a detector by reading ground-truth vehicles off the frame.

    In simulation mode a "frame" is the list of ground-truth vehicle dicts
    currently visible at a camera. This class reproduces real-detector
    imperfections: it occasionally misses a vehicle (recall < 1) and jitters
    bounding boxes and confidence scores.
    """

    def __init__(self, rng: Optional[random.Random] = None, miss_rate: float = 0.06):
        self.rng = rng or random
        self.miss_rate = miss_rate

    def detect(self, frame) -> List[dict]:
        # Handle real video frame matrices (numpy arrays) by generating simulated detections
        import numpy as np
        if isinstance(frame, np.ndarray) or (frame is not None and not isinstance(frame, list)):
            if self.rng.random() < 0.12:  # 12% chance of detecting a vehicle in this frame
                states = ["MH", "DL", "KA", "TN", "UP", "HR", "GJ"]
                state = self.rng.choice(states)
                district = f"{self.rng.randint(1, 99):02d}"
                series = "".join(self.rng.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ") for _ in range(2))
                num = f"{self.rng.randint(1, 9999):04d}"
                random_plate = f"{state}-{district}-{series}-{num}"
                
                colors = ["White", "Black", "Silver", "Blue", "Red", "Yellow", "Green"]
                random_color = self.rng.choice(colors)

                gt = {
                    "bbox": (100, 200, 300, 400),
                    "type": self.rng.choice(["Car", "Truck", "Bus", "Motorcycle"]),
                    "speed_kmh": round(self.rng.uniform(35.0, 75.0), 1),
                    "_vid": self.rng.randint(1000, 9999),
                    "context": {},
                    "plate": random_plate,
                    "color": random_color,
                    "obscured": False
                }
                return [{
                    "bbox": gt["bbox"],
                    "confidence": round(self.rng.uniform(0.85, 0.99), 3),
                    "vehicle_type": gt["type"],
                    "speed_kmh": gt["speed_kmh"],
                    "_ground_truth": gt,
                }]
            return []

        detections = []
        for gt in frame or []:
            if self.rng.random() < self.miss_rate:
                continue  # missed detection
            detections.append({
                "bbox": self._jitter(gt["bbox"]),
                "confidence": round(self.rng.uniform(0.80, 0.99), 3),
                "vehicle_type": gt["type"],
                "speed_kmh": gt.get("speed_kmh"),
                "_ground_truth": gt,
            })
        return detections

    def _jitter(self, bbox):
        return tuple(v + self.rng.uniform(-3, 3) for v in bbox)


# COCO class ids that correspond to road vehicles, mapped to our taxonomy.
_COCO_VEHICLE_MAP = {2: "Car", 3: "Motorcycle", 5: "Bus", 7: "Truck"}


class YOLODetector(BaseDetector):
    """Real YOLOv8 detector. Requires ``ultralytics`` and model weights.

    Only instantiated when ``detection.engine == 'yolo'``; the heavy import is
    deferred to keep mock mode dependency-free.
    """

    def __init__(self, model_path: str = "yolov8s.pt",
                 confidence_threshold: float = 0.5, device: str = "cpu"):
        from ultralytics import YOLO  # noqa: heavy optional dependency
        self.model = YOLO(model_path)
        self.confidence_threshold = confidence_threshold
        self.device = device

    def detect(self, frame) -> List[dict]:
        results = self.model(frame, verbose=False, device=self.device)
        detections = []
        for r in results:
            for box in r.boxes:
                cls = int(box.cls.item())
                conf = float(box.conf.item())
                if cls not in _COCO_VEHICLE_MAP or conf < self.confidence_threshold:
                    continue
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                detections.append({
                    "bbox": (x1, y1, x2, y2),
                    "confidence": conf,
                    "vehicle_type": _COCO_VEHICLE_MAP[cls],
                })
        return detections
