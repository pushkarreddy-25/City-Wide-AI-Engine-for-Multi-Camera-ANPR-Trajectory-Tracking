"""Cross-camera trajectory linking.

Associates vehicle sightings from different cameras into a single city-wide
journey. Association evidence, in priority order:

1. **Exact plate match** with sufficient OCR confidence.
2. **Near plate match** (<=1 character edit) supported by matching attributes.
3. **Attribute match** (type + colour) alone, for low-confidence plate reads.

Every candidate link must also be **spatially and temporally feasible**: the
implied speed between the two camera positions must be non-negative, below a
realistic urban maximum, and within the maximum time gap (SRS FR2.2 / 5.2).

The canonical plate for a trajectory is chosen by confidence-weighted vote
across its sightings, which corrects single-character OCR errors.
"""
from collections import Counter
from typing import List, Optional

from utils.config import cameras as camera_config
from utils.geo import direction_between, haversine_m
from utils.plate import plates_similar


class TrajectoryLinker:
    # match scores (higher = stronger evidence). The plate is the primary key;
    # attributes and feasibility are supporting/gating signals.
    SCORE_EXACT_PLATE = 4        # identical high-confidence plate
    SCORE_NEAR_PLATE_ATTRS = 3   # <=1 edit + matching type & colour
    SCORE_NEAR_PLATE = 2         # <=1 edit alone (OCR misreads one char)
    SCORE_ATTRS = 1              # type & colour only (low-confidence plate)

    def __init__(self, cameras: Optional[dict] = None, max_time_gap_s: int = 600,
                 max_speed_mps: float = 40.0, plate_conf_threshold: float = 0.8):
        self.cameras = cameras or camera_config()
        self.max_time_gap_s = max_time_gap_s
        self.max_speed_mps = max_speed_mps
        self.plate_conf_threshold = plate_conf_threshold

    # -- public API ---------------------------------------------------------
    def reduce_to_sightings(self, detections: List[dict]) -> List[dict]:
        """Collapse per-frame detections into one sighting per (camera, track)."""
        groups: dict = {}
        for d in detections:
            key = (d["camera_id"], d.get("track_id") or d.get("plate"))
            groups.setdefault(key, []).append(d)

        sightings = []
        for dets in groups.values():
            best = max(dets, key=lambda x: x.get("plate_confidence", 0) or 0)
            first_ts = min(d["timestamp"] for d in dets)
            cam = self.cameras.get(best["camera_id"], {})
            # A visit spans several frames: majority-vote the attributes to shrug
            # off per-frame classifier noise, and keep the highest plate confidence.
            types = Counter(d.get("vehicle_type") or d.get("type")
                            for d in dets if (d.get("vehicle_type") or d.get("type")))
            colors = Counter(d.get("vehicle_color") or d.get("color")
                             for d in dets if (d.get("vehicle_color") or d.get("color")))
            max_conf = max((d.get("plate_confidence", 0) or 0) for d in dets)
            sightings.append({
                "camera_id": best["camera_id"],
                "camera_name": cam.get("name"),
                "timestamp": first_ts,
                "plate": best.get("plate"),
                "plate_confidence": max_conf,
                "type": types.most_common(1)[0][0] if types else None,
                "color": colors.most_common(1)[0][0] if colors else None,
                "position": {"lat": cam.get("latitude"), "lng": cam.get("longitude")},
                "_true_vehicle_id": best.get("_true_vehicle_id"),  # evaluation only
            })
        return sightings

    def link(self, detections: List[dict], reduce: bool = True) -> List[dict]:
        """Return a list of trajectory dicts built from detections/sightings."""
        sightings = self.reduce_to_sightings(detections) if reduce else list(detections)
        sightings.sort(key=lambda s: s["timestamp"])

        open_trajectories: List[dict] = []
        for s in sightings:
            best_traj, best_score, best_recency = None, 0, None
            for traj in open_trajectories:
                score = self._match_score(traj, s)
                if score <= 0:
                    continue
                recency = traj["sightings"][-1]["timestamp"]
                if score > best_score or (score == best_score and (best_recency is None or recency > best_recency)):
                    best_traj, best_score, best_recency = traj, score, recency

            if best_traj is None:
                best_traj = {"sightings": [], "_plate_votes": Counter()}
                open_trajectories.append(best_traj)

            best_traj["sightings"].append(s)
            if s.get("plate"):
                best_traj["_plate_votes"][s["plate"]] += (s.get("plate_confidence") or 0.01)

        return [self._finalize(t) for t in open_trajectories]

    # -- matching -----------------------------------------------------------
    def _match_score(self, traj: dict, s: dict) -> int:
        last = traj["sightings"][-1]
        if not self._feasible(last, s):
            return 0
        lp, sp = last.get("plate"), s.get("plate")
        conf_ok = max(last.get("plate_confidence", 0), s.get("plate_confidence", 0)) >= self.plate_conf_threshold
        if lp and sp:
            if lp == sp and conf_ok:
                return self.SCORE_EXACT_PLATE
            # A near plate (<=1 edit) is strong evidence on its own — the OCR mock
            # (and real engines) typically miss a single confusable character.
            # Attribute agreement, when present, makes it stronger still.
            if plates_similar(lp, sp, 1):
                return self.SCORE_NEAR_PLATE_ATTRS if self._attrs_match(last, s) else self.SCORE_NEAR_PLATE
        # Attribute-only linking is a fallback for when the plate is unreadable.
        # Allow it only across different cameras, and never when both sightings
        # carry confident plates that clearly differ (that means two vehicles).
        if last["camera_id"] != s["camera_id"] and self._attrs_match(last, s):
            if lp and sp and conf_ok and not plates_similar(lp, sp, 1):
                return 0
            return self.SCORE_ATTRS
        return 0

    @staticmethod
    def _attrs_match(a: dict, b: dict) -> bool:
        return a.get("type") == b.get("type") and a.get("color") == b.get("color")

    def _feasible(self, a: dict, b: dict) -> bool:
        dt = (b["timestamp"] - a["timestamp"]).total_seconds()
        if dt <= 0 or dt > self.max_time_gap_s:
            return False
        pa, pb = a["position"], b["position"]
        if None in (pa.get("lat"), pb.get("lat")):
            return True  # no geometry available; rely on time gap only
        dist = haversine_m(pa["lat"], pa["lng"], pb["lat"], pb["lng"])
        return (dist / dt) <= self.max_speed_mps

    # -- finalization -------------------------------------------------------
    def _finalize(self, traj: dict) -> dict:
        sightings = traj["sightings"]
        for i, s in enumerate(sightings):
            if i + 1 < len(sightings):
                s["direction"] = self._direction(s, sightings[i + 1])
            elif i > 0:
                s["direction"] = sightings[i - 1].get("direction")
            else:
                s["direction"] = None

        plate = traj["_plate_votes"].most_common(1)[0][0] if traj["_plate_votes"] else None
        types = Counter(s["type"] for s in sightings if s.get("type"))
        colors = Counter(s["color"] for s in sightings if s.get("color"))
        return {
            "plate": plate,
            "date": sightings[0]["timestamp"].date(),
            "vehicle_type": types.most_common(1)[0][0] if types else None,
            "vehicle_color": colors.most_common(1)[0][0] if colors else None,
            "sightings": [{k: v for k, v in s.items() if not k.startswith("_")} for s in sightings],
            "_true_vehicle_ids": [s.get("_true_vehicle_id") for s in sightings],
        }

    @staticmethod
    def _direction(a: dict, b: dict):
        pa, pb = a["position"], b["position"]
        if None in (pa.get("lat"), pb.get("lat")):
            return None
        return direction_between(pa["lat"], pa["lng"], pb["lat"], pb["lng"])
