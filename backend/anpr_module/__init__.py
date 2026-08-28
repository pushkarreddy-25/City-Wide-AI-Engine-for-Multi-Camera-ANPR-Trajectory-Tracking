"""ANPR module: vehicle detection, plate OCR and attribute extraction.

Two implementations exist for each stage, selected by ``config/anpr_config.yaml``:

* ``Mock*``  — deterministic-ish synthetic behavior for the simulator. Reads
  ground truth carried on the frame and injects realistic noise (missed
  detections, OCR character confusion, colour errors). Runs anywhere, no GPU.
* Real (``YOLODetector``, ``EasyOCROCR``, ``HistogramColorClassifier``) — wrap
  the actual models and lazy-import their heavy dependencies, so the package
  stays importable in mock mode.

The public entry point is :class:`~anpr_module.engine.ANPREngine`.
"""
from anpr_module.base import VehicleDetection
from anpr_module.engine import ANPREngine

__all__ = ["ANPREngine", "VehicleDetection"]
