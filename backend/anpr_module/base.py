"""Shared types and interfaces for the ANPR pipeline."""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List, Optional, Tuple


@dataclass
class VehicleDetection:
    """One vehicle detected in a frame, after detection + OCR + attributes."""
    bbox: Tuple[float, float, float, float]
    vehicle_confidence: float
    vehicle_type: str
    vehicle_color: str
    plate_text: str
    plate_confidence: float
    valid_plate: bool
    speed_kmh: Optional[float] = None
    track_id: Optional[str] = None

    def to_dict(self) -> dict:
        x1, y1, x2, y2 = self.bbox
        return {
            "bbox": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
            "vehicle_confidence": round(self.vehicle_confidence, 3),
            "type": self.vehicle_type,
            "color": self.vehicle_color,
            "plate": self.plate_text,
            "plate_confidence": round(self.plate_confidence, 3),
            "valid_plate": self.valid_plate,
            "speed_kmh": round(self.speed_kmh, 1) if self.speed_kmh is not None else None,
            "track_id": self.track_id,
        }


class BaseDetector(ABC):
    """Detects vehicles in a frame."""

    @abstractmethod
    def detect(self, frame) -> List[dict]:
        """Return a list of raw detection dicts.

        Each dict has at least ``bbox`` (x1,y1,x2,y2), ``confidence`` and
        ``vehicle_type``. Mock detectors additionally attach ``_ground_truth``.
        """


class BaseOCR(ABC):
    """Reads a plate string (and confidence) from a detection."""

    @abstractmethod
    def read(self, frame, detection: dict) -> Tuple[str, float]:
        ...


class BaseAttributeClassifier(ABC):
    """Classifies vehicle attributes (colour) from a detection."""

    @abstractmethod
    def classify(self, frame, detection: dict) -> str:
        ...
