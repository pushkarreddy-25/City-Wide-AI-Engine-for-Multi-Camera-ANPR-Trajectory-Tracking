"""Processing pipeline: the glue that turns a camera frame into stored,
published intelligence.

For each frame it runs ANPR (detection -> OCR -> attributes), assigns/【maintains
track IDs, checks for violations, persists detections and violations, and
publishes live views to the cache. The exact same pipeline serves the real-time
loop and (with ``track=False``, ``publish=False``) the history seeder.

The transaction is owned by the caller: this method ``flush``es so freshly
inserted violations get their IDs (needed for the alert feed) but never commits.
"""
from typing import List, Optional, Tuple

from anpr_module.engine import ANPREngine
from db import repository
from services import live_service
from services.violation_service import ViolationService
from tracking_module import TrackerManager
from utils.config import cameras as camera_config


def _iso(dt):
    if dt is None:
        return None
    return dt.replace(microsecond=0).isoformat() + "Z"


class ProcessingPipeline:
    def __init__(self, engine=None, tracker=None, violation_service=None,
                 cameras=None, rng=None):
        self.cameras = cameras or camera_config()
        self.engine = engine or ANPREngine(rng=rng)
        self.tracker = tracker or TrackerManager()
        self.violations = violation_service or ViolationService(self.cameras)

    def process_frame(self, db, camera_id: str, frame, timestamp,
                      publish: bool = True, track: bool = True) -> Tuple[List[dict], list]:
        cam = self.cameras.get(camera_id, {})
        detailed = self.engine.process_frame_detailed(frame)

        dets: List[dict] = []
        for r in detailed:
            gt = (r.get("_source") or {}).get("_ground_truth") or {}
            dets.append({
                "camera_id": camera_id,
                "camera_name": cam.get("name"),
                "timestamp": timestamp,
                "plate": r["plate"],
                "plate_confidence": r["plate_confidence"],
                "vehicle_type": r["vehicle_type"],
                "vehicle_color": r["vehicle_color"],
                "speed_kmh": r["speed_kmh"],
                "bbox": r["bbox"],
                "valid_plate": r["valid_plate"],
                "position": {"lat": cam.get("latitude"), "lng": cam.get("longitude")},
                "_true_vehicle_id": gt.get("_vid"),
                "_context": gt.get("context") or {},
                "image_base64": r.get("image_base64"),
            })

        if track:
            self.tracker.update(camera_id, dets, timestamp)
        else:
            stamp = int(timestamp.timestamp())
            for d in dets:
                d["track_id"] = f"{camera_id}_v{d.get('_true_vehicle_id')}_{stamp}"

        alerts = []
        for d in dets:
            repository.add_detection(db, d)
            alerts.extend(self.violations.evaluate_and_store(db, d, d.get("_context")))

        db.flush()  # assign IDs for the alert feed; caller commits

        if publish:
            seen_tracks = set()
            for d in dets:
                if d.get("track_id") in seen_tracks:
                    continue
                seen_tracks.add(d.get("track_id"))
                live_service.publish_vehicle(self._vehicle_view(d))
            for v in alerts:
                live_service.publish_alert(v.to_dict())

        return dets, alerts

    def _vehicle_view(self, d: dict) -> dict:
        return {
            "camera_id": d["camera_id"],
            "camera_name": d["camera_name"],
            "track_id": d.get("track_id"),
            "plate": d["plate"],
            "plate_confidence": round(d["plate_confidence"], 3) if d["plate_confidence"] else None,
            "type": d["vehicle_type"],
            "color": d["vehicle_color"],
            "speed_kmh": round(d["speed_kmh"], 1) if d["speed_kmh"] else None,
            "valid_plate": d["valid_plate"],
            "position": d["position"],
            "timestamp": _iso(d["timestamp"]),
            "image_base64": d.get("image_base64"),
        }
