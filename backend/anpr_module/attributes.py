"""Vehicle attribute (colour) classification: mock and histogram implementations."""
import random
from typing import Optional

from anpr_module.base import BaseAttributeClassifier

COLORS = ["White", "Black", "Silver", "Blue", "Red", "Yellow", "Green", "Other"]


class MockAttributeClassifier(BaseAttributeClassifier):
    """Returns the ground-truth colour, wrong a small fraction of the time."""

    def __init__(self, rng: Optional[random.Random] = None, error_rate: float = 0.12):
        self.rng = rng or random
        self.error_rate = error_rate

    def classify(self, frame, detection: dict) -> str:
        gt = detection.get("_ground_truth")
        if gt is None:
            raise RuntimeError(
                "MockAttributeClassifier needs simulated ground truth. "
                "Set attributes.engine=histogram for real frames."
            )
        color = gt.get("color", "Other")
        if self.rng.random() < self.error_rate:
            return self.rng.choice(COLORS)
        return color


class HistogramColorClassifier(BaseAttributeClassifier):
    """Real colour classifier via dominant-hue histogram on the vehicle crop.

    Requires ``opencv-python`` and ``numpy``.
    """

    def __init__(self):
        import cv2  # noqa: optional dependency
        import numpy as np  # noqa
        self.cv2 = cv2
        self.np = np

    def classify(self, frame, detection: dict) -> str:
        cv2, np = self.cv2, self.np
        x1, y1, x2, y2 = [int(v) for v in detection["bbox"]]
        crop = frame[y1:y2, x1:x2]
        if crop.size == 0:
            return "Other"
        hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
        h, s, v = [int(np.median(hsv[:, :, i])) for i in range(3)]
        if v < 50:
            return "Black"
        if s < 40 and v > 200:
            return "White"
        if s < 40:
            return "Silver"
        if h < 10 or h > 170:
            return "Red"
        if 100 <= h <= 130:
            return "Blue"
        if 40 <= h <= 80:
            return "Green"
        if 20 <= h <= 35:
            return "Yellow"
        return "Other"
