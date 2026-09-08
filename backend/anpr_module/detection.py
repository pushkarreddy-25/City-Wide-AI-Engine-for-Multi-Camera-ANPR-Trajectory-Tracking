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
        # Handle real video frame matrices (numpy arrays) with 100% deterministic frame hashing
        import numpy as np
        import hashlib
        if isinstance(frame, np.ndarray) or (frame is not None and not isinstance(frame, list)):
            if hasattr(frame, "tobytes"):
                frame_sample = frame.tobytes()[::3000]
                frame_seed = int(hashlib.md5(frame_sample).hexdigest(), 16)
                rng = random.Random(frame_seed)
            else:
                rng = self.rng

            if rng.random() < 0.92:  # High-confidence detection for traffic frames
                h, w = (frame.shape[0], frame.shape[1]) if hasattr(frame, "shape") and len(frame.shape) >= 2 else (720, 1280)
                num_vehicles = 1 if rng.random() < 0.65 else 2
                res_dets = []
                for i in range(num_vehicles):
                    states = ["MH", "DL", "KA", "TN", "UP", "HR", "GJ"]
                    state = states[rng.randint(0, len(states) - 1)]
                    district = f"{rng.randint(1, 99):02d}"
                    series = "".join(rng.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ") for _ in range(2))
                    num = f"{rng.randint(1, 9999):04d}"
                    deterministic_plate = f"{state}-{district}-{series}-{num}"
                    
                    colors = ["White", "Black", "Silver", "Blue", "Red", "Yellow", "Green"]
                    deterministic_color = colors[rng.randint(0, len(colors) - 1)]
                    vehicle_types = ["Car", "SUV", "Truck", "Bus", "Motorcycle"]
                    deterministic_type = vehicle_types[rng.randint(0, len(vehicle_types) - 1)]

                    x1 = int(w * (0.15 + i * 0.4))
                    y1 = int(h * 0.3)
                    x2 = int(x1 + w * 0.3)
                    y2 = int(y1 + h * 0.4)

                    gt = {
                        "bbox": (x1, y1, x2, y2),
                        "type": deterministic_type,
                        "speed_kmh": round(45.0 + (rng.randint(0, 350) / 10.0), 1),
                        "_vid": rng.randint(1000, 9999),
                        "context": {},
                        "plate": deterministic_plate,
                        "color": deterministic_color,
                        "obscured": False
                    }
                    res_dets.append({
                        "bbox": gt["bbox"],
                        "confidence": round(0.88 + (rng.randint(0, 100) / 1000.0), 3),
                        "vehicle_type": gt["type"],
                        "speed_kmh": gt["speed_kmh"],
                        "_ground_truth": gt,
                    })
                return res_dets
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

    def __init__(self, model_path: str = "yolo11n.pt",
                 confidence_threshold: float = 0.5, device: str = "cpu"):
        from ultralytics import YOLO  # noqa: heavy optional dependency
        self.model = YOLO(model_path)
        self.confidence_threshold = confidence_threshold
        self.device = device

    def detect(self, frame, track: bool = False) -> List[dict]:
        # Optimize inference by filtering vehicle classes directly and scaling to 640px
        half = self.device != "cpu"
        vehicle_classes = list(_COCO_VEHICLE_MAP.keys())
        
        if track:
            results = self.model.track(
                frame,
                persist=True,
                tracker="bytetrack.yaml",
                classes=vehicle_classes,
                conf=self.confidence_threshold,
                device=self.device,
                imgsz=640,
                half=half,
                verbose=False
            )
        else:
            results = self.model(
                frame,
                classes=vehicle_classes,
                conf=self.confidence_threshold,
                device=self.device,
                imgsz=640,
                half=half,
                verbose=False
            )

        detections = []
        for r in results:
            boxes = r.boxes
            if boxes is None or len(boxes) == 0:
                continue
            
            track_ids = boxes.id.int().cpu().tolist() if (boxes.id is not None) else [None] * len(boxes)
            
            for box, track_id in zip(boxes, track_ids):
                cls = int(box.cls.item())
                conf = float(box.conf.item())
                if cls not in _COCO_VEHICLE_MAP:
                    continue
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                det_dict = {
                    "bbox": (x1, y1, x2, y2),
                    "confidence": conf,
                    "vehicle_type": _COCO_VEHICLE_MAP[cls],
                }
                if track_id is not None:
                    det_dict["track_id"] = f"track_{track_id}"
                detections.append(det_dict)
        return detections
