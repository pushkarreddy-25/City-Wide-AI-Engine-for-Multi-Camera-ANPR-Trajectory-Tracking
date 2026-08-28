"""Rule-based traffic-violation detection.

The detector applies genuine rules to a detection plus a small ``context`` dict
describing conditions the camera/edge would supply (current signal phase, and
in simulation, whether a lane scenario applies):

* **red_light**  - signal is red *and* the vehicle's bounding box has crossed
  the camera's configured stop line.
* **over_speed** - estimated speed exceeds the camera's posted limit beyond a
  tolerance; severity scales with how far over.
* **wrong_lane** - improper lane use; the lane index is derived from the bbox
  centre against the camera's lane boundaries.

Keeping the rules here (and the *scenario* in the simulator) means the exact
same detector works unchanged against real signal feeds and trackers.
"""
from typing import List, Optional

from utils.config import cameras as camera_config

RED_LIGHT = "red_light"
OVER_SPEED = "over_speed"
WRONG_LANE = "wrong_lane"
VIOLATION_TYPES = (RED_LIGHT, OVER_SPEED, WRONG_LANE)


class ViolationDetector:
    def __init__(self, cameras: Optional[dict] = None, speed_tolerance_kmh: float = 5.0):
        self.cameras = cameras or camera_config()
        self.speed_tolerance = speed_tolerance_kmh

    def evaluate(self, det: dict, context: Optional[dict] = None) -> List[dict]:
        """Return zero or more violation records for a single detection."""
        context = context or {}
        cam = self.cameras.get(det.get("camera_id"), {})
        out: List[dict] = []

        if context.get("signal_state") == "red" and self._crossed_stop_line(det, cam):
            out.append(self._make(RED_LIGHT, det, cam, severity="high",
                                   notes="Entered intersection on red signal"))

        limit = cam.get("speed_limit_kmh")
        speed = det.get("speed_kmh")
        if speed and limit and speed > limit + self.speed_tolerance:
            over = speed - limit
            severity = "high" if over >= 20 else "medium"
            out.append(self._make(OVER_SPEED, det, cam, severity=severity,
                                   speed=speed, limit=limit,
                                   notes=f"{speed:.0f} km/h in {limit:.0f} km/h zone"))

        if context.get("lane_violation"):
            lane = self._lane_index(det, cam)
            where = f" (lane {lane})" if lane else ""
            out.append(self._make(WRONG_LANE, det, cam, severity="medium",
                                   notes=f"Improper lane usage{where}"))
        return out

    # -- rule helpers -------------------------------------------------------
    @staticmethod
    def _crossed_stop_line(det: dict, cam: dict) -> bool:
        stop_y = cam.get("stop_line_y")
        bbox = det.get("bbox")
        if stop_y is None or not bbox:
            return True  # no geometry configured; trust the signal context
        y2 = bbox[3] if isinstance(bbox, (list, tuple)) else bbox.get("y2")
        return y2 is not None and y2 >= stop_y

    @staticmethod
    def _lane_index(det: dict, cam: dict) -> Optional[int]:
        boundaries = cam.get("lanes") or cam.get("lane_boundaries") or []
        bbox = det.get("bbox")
        if not boundaries or not bbox:
            return None
        x1 = bbox[0] if isinstance(bbox, (list, tuple)) else bbox.get("x1")
        x2 = bbox[2] if isinstance(bbox, (list, tuple)) else bbox.get("x2")
        if x1 is None or x2 is None:
            return None
        cx = (x1 + x2) / 2.0
        xs = [b if isinstance(b, (int, float)) else b.get("x") for b in boundaries]
        xs = sorted(x for x in xs if x is not None)
        return sum(1 for b in xs if cx >= b) + 1

    def _make(self, vtype, det, cam, severity, notes, speed=None, limit=None) -> dict:
        plate_conf = det.get("plate_confidence") or 0.0
        confidence = round(min(0.99, 0.6 + 0.39 * plate_conf), 3)
        return {
            "violation_type": vtype,
            "plate_text": det.get("plate"),
            "camera_id": det.get("camera_id"),
            "camera_name": cam.get("name"),
            "timestamp": det.get("timestamp"),
            "severity": severity,
            "confidence": confidence,
            "speed_kmh": speed,
            "posted_limit": limit if limit is not None else cam.get("speed_limit_kmh"),
            "image_path": self._evidence_path(vtype, det),
            "notes": notes,
        }

    @staticmethod
    def _evidence_path(vtype, det) -> str:
        ts = det.get("timestamp")
        stamp = int(ts.timestamp()) if ts else 0
        plate = (det.get("plate") or "unknown").replace("-", "")
        return f"evidence/{det.get('camera_id')}/{vtype}_{plate}_{stamp}.jpg"
