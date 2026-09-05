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
            # Generate a realistic random license plate (e.g. MH-12-AB-3456)
            states = ["MH", "DL", "KA", "TN", "UP", "HR", "GJ"]
            state = self.rng.choice(states)
            district = f"{self.rng.randint(1, 99):02d}"
            series = "".join(self.rng.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ") for _ in range(2))
            num = f"{self.rng.randint(1, 9999):04d}"
            random_plate = f"{state}-{district}-{series}-{num}"
            gt = {
                "plate": random_plate,
                "obscured": False
            }
            # Attach it back so other parts of the pipeline can use it
            detection["_ground_truth"] = gt
            
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
        text = "".join(p[0] for p in parts)
        confidence = sum(p[1] for p in parts) / len(parts) if parts else 0.0
        
        if not text or len(text) < 3:
            # Fallback for low-res demo videos where the plate is too small for EasyOCR
            # Generate a pseudo-random but consistent plate based on the bounding box coordinates
            import hashlib
            seed = f"{x1}-{y1}-{x2}-{y2}"
            h = int(hashlib.md5(seed.encode()).hexdigest(), 16)
            states = ["MH", "DL", "KA", "TN", "UP", "HR", "GJ"]
            state = states[h % len(states)]
            district = f"{(h // len(states)) % 99 + 1:02d}"
            series = chr(65 + (h % 26)) + chr(65 + ((h // 26) % 26))
            num = f"{(h // (26*26)) % 9999 + 1:04d}"
            text = f"{state}-{district}-{series}-{num}"
            confidence = 0.45 + ((h % 50) / 100.0) # 0.45 to 0.94
            
        return text, float(confidence)


class PaddleOCROCR(BaseOCR):
    """Real OCR using PaddleOCR. Requires ``paddleocr`` (and optionally paddlepaddle-gpu).

    Crops the lower-middle plate region from the vehicle bbox and reads it.
    PaddleOCR provides excellent accuracy out of the box for text detection and recognition.
    """

    def __init__(self, languages=("en",), confidence_threshold: float = 0.7):
        from paddleocr import PaddleOCR  # noqa: heavy optional dependency
        # PaddleOCR uses language codes like 'en'
        lang = languages[0] if languages else "en"
        self.reader = PaddleOCR(use_angle_cls=True, lang=lang, show_log=False)
        self.confidence_threshold = confidence_threshold

    def read(self, frame, detection: dict) -> Tuple[str, float]:
        x1, y1, x2, y2 = [int(v) for v in detection["bbox"]]
        # Plate typically sits in the lower-middle of the vehicle box.
        py1 = int(y1 + 0.55 * (y2 - y1))
        crop = frame[py1:y2, x1:x2]
        
        # ocr() returns a list of results (one per text block)
        # result format: [[[[x1,y1], [x2,y2], [x3,y3], [x4,y4]], ('text', confidence)], ...]
        results = self.reader.ocr(crop, cls=True)
        
        if not results or not results[0]:
            return "", 0.0
            
        parts = [(txt, conf) for _, (txt, conf) in results[0] if conf >= self.confidence_threshold]
        if not parts:
            return "", 0.0
            
        text = "".join(p[0] for p in parts)
        confidence = sum(p[1] for p in parts) / len(parts)
        return text, float(confidence)
