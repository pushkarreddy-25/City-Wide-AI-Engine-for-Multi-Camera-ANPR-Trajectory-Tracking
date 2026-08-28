"""Violation service: runs the detector and persists results.

Thin wrapper so callers (the simulator now, real edge feeds later) don't touch
the detector or ORM directly. The caller owns the transaction/commit.
"""
from typing import List, Optional

from db import repository
from violations.detector import ViolationDetector


class ViolationService:
    def __init__(self, cameras: Optional[dict] = None, speed_tolerance_kmh: float = 5.0):
        self.detector = ViolationDetector(cameras, speed_tolerance_kmh)

    def evaluate_and_store(self, db, detection: dict, context: Optional[dict] = None):
        """Detect violations for one detection and stage them in the session.

        Returns the list of created ``Violation`` ORM objects (not yet
        committed) so the caller can serialize them for the live alert feed.
        """
        records = self.detector.evaluate(detection, context)
        return [repository.add_violation(db, r) for r in records]
