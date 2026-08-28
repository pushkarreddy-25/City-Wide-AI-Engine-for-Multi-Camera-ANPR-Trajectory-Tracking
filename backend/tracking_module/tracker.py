"""Single-camera multi-object tracking.

``SimpleTracker`` assigns and maintains per-camera track IDs by matching
detections across frames using IoU with a centroid-distance fallback. It needs
no GPU or external tracker and works directly on the ANPR detections, so it
runs in simulation mode. ``ByteTrackTracker`` is the production drop-in.

``TrackerManager`` keeps one tracker per camera and is what the pipeline calls.

Aging: a camera is only updated on frames where it actually sees a vehicle, so
tracks are retired by **wall-clock gap** (``max_gap_seconds``) when a timestamp
is supplied, falling back to a frame-count budget (``max_age``) otherwise. This
stops two different vehicles that pass the same pixel seconds apart from being
merged into one track.
"""
from datetime import datetime
from typing import Dict, List, Optional


def _epoch(ts) -> Optional[float]:
    if ts is None:
        return None
    if isinstance(ts, datetime):
        return ts.timestamp()
    try:
        return float(ts)
    except (TypeError, ValueError):
        return None


def iou(a, b) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def _centroid(box):
    x1, y1, x2, y2 = box
    return ((x1 + x2) / 2.0, (y1 + y2) / 2.0)


def _dist(p, q):
    return ((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2) ** 0.5


class SimpleTracker:
    """IoU/centroid tracker for one camera.

    Each detection dict is annotated in place with a ``track_id`` of the form
    ``"{camera_id}_track_{n}"``. Tracks that go unseen for ``max_age`` updates
    are dropped (handles a vehicle leaving the frame).
    """

    def __init__(self, camera_id: str, iou_threshold: float = 0.3,
                 max_centroid_dist: float = 80.0, max_age: int = 5,
                 max_gap_seconds: float = 6.0):
        self.camera_id = camera_id
        self.iou_threshold = iou_threshold
        self.max_centroid_dist = max_centroid_dist
        self.max_age = max_age
        self.max_gap_seconds = max_gap_seconds
        self._tracks: Dict[int, dict] = {}   # local id -> {bbox, last_tick, last_ts, plate, plate_conf}
        self._next_id = 1
        self._tick = 0

    def update(self, detections: List[dict], timestamp=None) -> List[dict]:
        self._tick += 1
        now_ts = _epoch(timestamp)
        # Retire tracks unseen for too long *before* matching, so a vehicle that
        # arrives long after another left the same spot starts a fresh track.
        if now_ts is not None:
            self._retire_by_time(now_ts)
        used = set()
        for det in detections:
            box = det["bbox"]
            best_id, best_iou = None, self.iou_threshold
            for tid, tr in self._tracks.items():
                if tid in used:
                    continue
                score = iou(box, tr["bbox"])
                if score >= best_iou:
                    best_id, best_iou = tid, score
            if best_id is None:  # IoU failed; try centroid proximity
                c = _centroid(box)
                best_d = self.max_centroid_dist
                for tid, tr in self._tracks.items():
                    if tid in used:
                        continue
                    d = _dist(c, _centroid(tr["bbox"]))
                    if d <= best_d:
                        best_id, best_d = tid, d
            if best_id is None:
                best_id = self._next_id
                self._next_id += 1
            # keep the most confident plate observed for this track
            prev = self._tracks.get(best_id, {})
            plate, pconf = prev.get("plate"), prev.get("plate_conf", 0.0)
            if det.get("plate_confidence", 0.0) >= pconf:
                plate, pconf = det.get("plate"), det.get("plate_confidence", 0.0)
            self._tracks[best_id] = {"bbox": box, "last_tick": self._tick, "last_ts": now_ts,
                                     "plate": plate, "plate_conf": pconf}
            used.add(best_id)
            det["track_id"] = f"{self.camera_id}_track_{best_id}"
        self._age_out()
        return detections

    def _retire_by_time(self, now_ts: float):
        stale = [tid for tid, tr in self._tracks.items()
                 if tr.get("last_ts") is not None and now_ts - tr["last_ts"] > self.max_gap_seconds]
        for tid in stale:
            del self._tracks[tid]

    def _age_out(self):
        stale = [tid for tid, tr in self._tracks.items()
                 if self._tick - tr["last_tick"] > self.max_age]
        for tid in stale:
            del self._tracks[tid]


class TrackerManager:
    """Routes detections to the right per-camera tracker."""

    def __init__(self, backend: str = "simple"):
        self.backend = backend
        self._trackers: Dict[str, SimpleTracker] = {}

    def update(self, camera_id: str, detections: List[dict], timestamp=None) -> List[dict]:
        tracker = self._trackers.get(camera_id)
        if tracker is None:
            tracker = SimpleTracker(camera_id)
            self._trackers[camera_id] = tracker
        return tracker.update(detections, timestamp)


class ByteTrackTracker:
    """Production tracker wrapping ByteTrack (requires ``yolox``).

    Kept as a documented drop-in: construct one per camera and expose the same
    ``update(detections)`` contract as :class:`SimpleTracker`. Wiring is left
    commented because the ``yolox`` tracker API expects numpy detection arrays
    and frame dimensions that are only available with real video.
    """

    def __init__(self, camera_id: str, frame_rate: int = 30):
        from yolox.tracker.byte_tracker import BYTETracker  # noqa: optional dependency

        class _Args:
            track_thresh = 0.5
            track_buffer = 30
            match_thresh = 0.8
            mot20 = False

        self.camera_id = camera_id
        self.tracker = BYTETracker(_Args(), frame_rate=frame_rate)

    def update(self, detections: List[dict]) -> List[dict]:  # pragma: no cover
        raise NotImplementedError(
            "Wire BYTETracker.update() with numpy [x1,y1,x2,y2,score] arrays and "
            "image size when connecting real video feeds."
        )
