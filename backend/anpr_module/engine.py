"""ANPREngine: orchestrates detection -> OCR -> attributes for one frame.

The engine is config-driven. In the default (mock) configuration every stage
runs without external dependencies; swapping engine values in
``config/anpr_config.yaml`` transparently upgrades to real models.
"""
import random
from typing import List, Optional

from anpr_module.attributes import HistogramColorClassifier, MockAttributeClassifier
from anpr_module.base import VehicleDetection
from anpr_module.detection import MockDetector, YOLODetector
from anpr_module.ocr import EasyOCROCR, MockOCR, PaddleOCROCR
from utils.config import get_anpr_config
from utils.plate import is_valid_plate, normalize_plate


class ANPREngine:
    def __init__(self, config: Optional[dict] = None, rng: Optional[random.Random] = None):
        cfg = config or get_anpr_config()
        self.rng = rng or random
        self.detector = self._build_detector(cfg.get("detection", {}))
        self.ocr = self._build_ocr(cfg.get("ocr", {}))
        self.attributes = self._build_attributes(cfg.get("attributes", {}))
        self.ocr_confidence_threshold = cfg.get("ocr", {}).get("confidence_threshold", 0.7)

    def _iter_results(self, frame):
        """Shared pipeline core: yield (raw_detection, plate, conf, color)."""
        for det in self.detector.detect(frame):
            plate_raw, plate_conf = self.ocr.read(frame, det)
            color = self.attributes.classify(frame, det)
            yield det, normalize_plate(plate_raw), plate_conf, color

    def process_frame(self, frame, timestamp=None) -> List[VehicleDetection]:
        """Run the full ANPR pipeline on one frame and return detections.

        This is the clean, production-facing contract: pure vision output with
        no simulation or camera-context leakage.
        """
        results = []
        for det, plate, plate_conf, color in self._iter_results(frame):
            results.append(VehicleDetection(
                bbox=tuple(det["bbox"]),
                vehicle_confidence=det["confidence"],
                vehicle_type=det.get("vehicle_type", "Car"),
                vehicle_color=color,
                plate_text=plate,
                plate_confidence=plate_conf,
                valid_plate=is_valid_plate(plate),
                speed_kmh=det.get("speed_kmh"),
                track_id=det.get("track_id"),
            ))
        return results

    def process_frame_detailed(self, frame) -> List[dict]:
        """Like :meth:`process_frame` but returns dicts that keep a reference to
        the source detection under ``_source``.

        Provenance lets the caller recover per-detection provenance (in mock
        mode, the ground-truth vehicle and its signal/lane context) for tracking,
        violation checks and linking-accuracy evaluation. In real mode ``_source``
        is simply the raw detector output.
        """
        # Protect against cross-mode queue pollution: drop frames meant for the other engine type.
        is_mock = self.detector.__class__.__name__ == "MockDetector"
        # Mock frames are lists of dicts. YOLO frames are numpy arrays.
        if is_mock and not isinstance(frame, list):
            return []
        if not is_mock and isinstance(frame, list):
            return []
            
        results = []
        for det, plate, plate_conf, color in self._iter_results(frame):
            res = {
                "bbox": tuple(det["bbox"]),
                "vehicle_confidence": det.get("confidence"),
                "vehicle_type": det.get("vehicle_type", "Car"),
                "vehicle_color": color,
                "plate": plate,
                "plate_confidence": plate_conf,
                "valid_plate": is_valid_plate(plate),
                "speed_kmh": det.get("speed_kmh"),
                "_source": det,
            }
            if not is_mock:
                import cv2
                import base64
                x1, y1, x2, y2 = map(int, det["bbox"])
                h, w = frame.shape[:2]
                x1, y1, x2, y2 = max(0, x1), max(0, y1), min(w, x2), min(h, y2)
                crop = frame[y1:y2, x1:x2]
                if crop.size > 0:
                    _, buffer = cv2.imencode('.jpg', crop)
                    res["image_base64"] = base64.b64encode(buffer).decode('utf-8')
            results.append(res)
        return results

    # -- component factories ------------------------------------------------
    def _build_detector(self, cfg):
        engine = cfg.get("engine", "mock")
        if engine == "yolo":
            return YOLODetector(
                model_path=cfg.get("model_path", "yolov8s.pt"),
                confidence_threshold=cfg.get("confidence_threshold", 0.5),
                device=cfg.get("device", "cpu"),
            )
        return MockDetector(rng=self.rng)

    def _build_ocr(self, cfg):
        engine = cfg.get("engine", "mock")
        if engine == "easyocr":
            return EasyOCROCR(
                languages=tuple(cfg.get("languages", ["en"])),
                confidence_threshold=cfg.get("confidence_threshold", 0.7),
            )
        elif engine == "paddleocr":
            return PaddleOCROCR(
                languages=tuple(cfg.get("languages", ["en"])),
                confidence_threshold=cfg.get("confidence_threshold", 0.7),
            )
        return MockOCR(rng=self.rng)

    def _build_attributes(self, cfg):
        engine = cfg.get("engine", "mock")
        if engine == "histogram":
            return HistogramColorClassifier()
        return MockAttributeClassifier(rng=self.rng)
