"""Plate OCR: mock (simulation) and real EasyOCR implementations."""
import random
from typing import Optional, Tuple

from anpr_module.base import BaseOCR
from utils.config import get_sim_config

# Character pairs that OCR engines commonly confuse. Used to make simulated
# misreads realistic (and to exercise the linking module's confidence logic).
_CONFUSION = {
    "0": "O", "O": "0", "1": "I", "I": "1", "8": "B", "B": "8",
    "5": "S", "S": "5", "2": "Z", "Z": "2", "6": "G", "G": "6",
}


class MockOCR(BaseOCR):
    """Simulates OCR from the ground-truth plate, with confidence and errors.

    Clear reads are usually correct with high confidence; a configurable
    fraction of reads are "obscured" (low light / dirt / motion blur) with
    lower confidence and a higher chance of a single-character misread.
    """

    def __init__(self, rng: Optional[random.Random] = None, sim_config: Optional[dict] = None):
        self.rng = rng or random
        sim = (sim_config or get_sim_config())["simulation"]
        self.clear_conf = tuple(sim["ocr_confidence_clear"])
        self.obscured_conf = tuple(sim["ocr_confidence_obscured"])

    def read(self, frame, detection: dict) -> Tuple[str, float]:
        gt = detection.get("_ground_truth")
        if gt is None:
            raise RuntimeError(
                "MockOCR needs simulated ground truth. Set ocr.engine=easyocr for real frames."
            )
        obscured = gt.get("obscured", False)
        if obscured:
            confidence = round(self.rng.uniform(*self.obscured_conf), 3)
            text = self._maybe_corrupt(gt["plate"], probability=0.5)
        else:
            confidence = round(self.rng.uniform(*self.clear_conf), 3)
            text = self._maybe_corrupt(gt["plate"], probability=0.08)
        return text, confidence

    def _maybe_corrupt(self, plate: str, probability: float) -> str:
        if self.rng.random() > probability:
            return plate
        chars = list(plate)
        swappable = [i for i, c in enumerate(chars) if c in _CONFUSION]
        if not swappable:
            return plate
        i = self.rng.choice(swappable)
        chars[i] = _CONFUSION[chars[i]]
        return "".join(chars)


class EasyOCROCR(BaseOCR):
    """Real OCR using EasyOCR. Requires ``easyocr`` (and torch).

    Crops the lower-middle plate region from the vehicle bbox and reads it.
    """

    def __init__(self, languages=("en",), confidence_threshold: float = 0.7):
        import easyocr  # noqa: heavy optional dependency
        self.reader = easyocr.Reader(list(languages))
        self.confidence_threshold = confidence_threshold

    def read(self, frame, detection: dict) -> Tuple[str, float]:
        x1, y1, x2, y2 = [int(v) for v in detection["bbox"]]
        # Plate typically sits in the lower-middle of the vehicle box.
        py1 = int(y1 + 0.55 * (y2 - y1))
        crop = frame[py1:y2, x1:x2]
        results = self.reader.readtext(crop)
        if not results:
            return "", 0.0
        parts = [(txt, conf) for _, txt, conf in results if conf >= self.confidence_threshold]
        if not parts:
            return "", 0.0
        text = "".join(p[0] for p in parts)
        confidence = sum(p[1] for p in parts) / len(parts)
        return text, float(confidence)
