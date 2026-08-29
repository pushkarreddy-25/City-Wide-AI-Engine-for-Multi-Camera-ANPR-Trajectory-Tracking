from __future__ import annotations

from typing import Any, Dict, Iterable, List

from db import repository
from db.database import SessionLocal
from services.violation_service import ViolationService


class StorageService:
    """Storage boundary: persists detection and violation records produced by workers."""

    def __init__(self, violation_service: ViolationService | None = None):
        self.violation_service = violation_service or ViolationService()

    def save_detection_batch(self, camera_id: str, detections: Iterable[Dict[str, Any]]):
        with SessionLocal() as db:
            for detection in detections:
                repository.add_detection(db, detection)
            db.commit()

    def save_violation_batch(self, camera_id: str, detections: Iterable[Dict[str, Any]]):
        with SessionLocal() as db:
            for detection in detections:
                self.violation_service.evaluate_and_store(db, detection, detection.get("_context"))
            db.commit()
