"""Centralized database access — the only module that builds ORM queries.

Both the API routers and the background simulator go through these functions,
so query shapes and response dicts stay consistent. Time-bucketed analytics are
aggregated in Python (portable across SQLite and PostgreSQL) rather than with
dialect-specific date functions.
"""
from datetime import date as date_cls
from datetime import datetime, timedelta
from typing import List, Optional

from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from db.models import Camera, Detection, Sighting, Trajectory, Violation
from utils.config import cameras as camera_config
from utils.sqlsafe import like_escape

#: Ceiling on rows pulled into Python by the portable (non-SQL) aggregations
#: below. Generous enough for a month of real traffic, but it stops a wide
#: ``?hours=720`` window from turning into unbounded memory growth.
MAX_ANALYTICS_ROWS = 500_000


def _bbox(d: dict):
    b = d.get("bbox")
    if isinstance(b, dict):
        return b.get("x1"), b.get("y1"), b.get("x2"), b.get("y2")
    if isinstance(b, (list, tuple)) and len(b) == 4:
        return tuple(b)
    return None, None, None, None


# -- detections -------------------------------------------------------------
def add_detection(db: Session, d: dict) -> Detection:
    x1, y1, x2, y2 = _bbox(d)
    det = Detection(
        camera_id=d.get("camera_id"),
        track_id=d.get("track_id"),
        timestamp=d.get("timestamp"),
        plate_text=d.get("plate") or d.get("plate_text"),
        plate_confidence=d.get("plate_confidence"),
        vehicle_type=d.get("vehicle_type") or d.get("type"),
        vehicle_color=d.get("vehicle_color") or d.get("color"),
        speed_kmh=d.get("speed_kmh"),
        bbox_x1=x1, bbox_y1=y1, bbox_x2=x2, bbox_y2=y2,
        image_path=d.get("image_path"),
    )
    db.add(det)
    return det


def add_detections(db: Session, items: List[dict]) -> int:
    for d in items:
        add_detection(db, d)
    return len(items)


def recent_detections(db: Session, minutes: int = 5, camera_id: Optional[str] = None,
                      limit: int = 200) -> List[Detection]:
    since = datetime.utcnow() - timedelta(minutes=minutes)
    q = db.query(Detection).filter(Detection.timestamp >= since)
    if camera_id:
        q = q.filter(Detection.camera_id == camera_id)
    return q.order_by(Detection.timestamp.desc()).limit(limit).all()


def search_detections(db: Session, plate: Optional[str] = None, vehicle_type: Optional[str] = None,
                      color: Optional[str] = None, camera_id: Optional[str] = None,
                      start: Optional[datetime] = None, end: Optional[datetime] = None,
                      limit: int = 100, offset: int = 0):
    q = db.query(Detection)
    if plate:
        pattern = f"%{like_escape(plate.upper())}%"
        q = q.filter(Detection.plate_text.like(pattern, escape="\\"))
    if vehicle_type:
        q = q.filter(Detection.vehicle_type == vehicle_type)
    if color:
        q = q.filter(Detection.vehicle_color == color)
    if camera_id:
        q = q.filter(Detection.camera_id == camera_id)
    if start:
        q = q.filter(Detection.timestamp >= start)
    if end:
        q = q.filter(Detection.timestamp <= end)
    total = q.count()
    rows = q.order_by(Detection.timestamp.desc()).offset(offset).limit(limit).all()
    return rows, total


# -- trajectories -----------------------------------------------------------
def add_trajectory(db: Session, t: dict) -> Trajectory:
    traj = Trajectory(
        plate_text=t.get("plate") or "UNKNOWN",
        date=t.get("date"),
        vehicle_type=t.get("vehicle_type"),
        vehicle_color=t.get("vehicle_color"),
    )
    db.add(traj)
    db.flush()  # assign trajectory_id
    for s in t.get("sightings", []):
        pos = s.get("position", {})
        db.add(Sighting(
            trajectory_id=traj.trajectory_id,
            camera_id=s.get("camera_id"),
            camera_name=s.get("camera_name"),
            timestamp=s.get("timestamp"),
            latitude=pos.get("lat"),
            longitude=pos.get("lng"),
            direction=s.get("direction"),
        ))
    return traj


def get_journey(db: Session, plate: str, on_date: Optional[date_cls] = None) -> Optional[Trajectory]:
    q = db.query(Trajectory).filter(Trajectory.plate_text == plate.upper())
    if on_date:
        q = q.filter(Trajectory.date == on_date)
    return q.order_by(Trajectory.date.desc(), Trajectory.trajectory_id.desc()).first()


# -- violations -------------------------------------------------------------
def add_violation(db: Session, v: dict) -> Violation:
    violation_type = v.get("violation_type") or v.get("type")
    plate_text = (v.get("plate_text") or v.get("plate") or "").upper()
    camera_id = v.get("camera_id")
    timestamp = v.get("timestamp")

    if violation_type and plate_text and camera_id and timestamp:
        db.flush()
        window_start = timestamp - timedelta(minutes=5)
        window_end = timestamp + timedelta(minutes=5)
        existing = (
            db.query(Violation)
            .filter(
                and_(
                    Violation.violation_type == violation_type,
                    Violation.plate_text == plate_text,
                    Violation.camera_id == camera_id,
                    Violation.timestamp >= window_start,
                    Violation.timestamp <= window_end,
                )
            )
            .order_by(Violation.confidence.desc().nullslast(), Violation.timestamp.desc())
            .first()
        )
        if existing is not None:
            new_confidence = float(v.get("confidence") or 0.0)
            existing_confidence = float(existing.confidence or 0.0)
            if new_confidence > existing_confidence:
                existing.camera_name = v.get("camera_name") or existing.camera_name
                existing.timestamp = timestamp
                existing.severity = v.get("severity") or existing.severity
                existing.confidence = new_confidence
                existing.speed_kmh = v.get("speed_kmh") if v.get("speed_kmh") is not None else existing.speed_kmh
                existing.posted_limit = v.get("posted_limit") if v.get("posted_limit") is not None else existing.posted_limit
                existing.image_path = v.get("image_path") or existing.image_path
                existing.notes = v.get("notes") or existing.notes
            return existing

    vio = Violation(
        violation_type=violation_type,
        plate_text=plate_text,
        camera_id=camera_id,
        camera_name=v.get("camera_name"),
        timestamp=timestamp,
        severity=v.get("severity"),
        confidence=v.get("confidence"),
        speed_kmh=v.get("speed_kmh"),
        posted_limit=v.get("posted_limit"),
        image_path=v.get("image_path"),
        notes=v.get("notes"),
    )
    db.add(vio)
    return vio


def list_violations(db: Session, limit: int = 50, offset: int = 0, vtype: Optional[str] = None,
                    severity: Optional[str] = None, resolved: Optional[bool] = None,
                    start: Optional[datetime] = None, end: Optional[datetime] = None):
    q = db.query(Violation)
    if vtype:
        q = q.filter(Violation.violation_type == vtype)
    if severity:
        q = q.filter(Violation.severity == severity)
    if resolved is not None:
        q = q.filter(Violation.resolved == resolved)
    if start:
        q = q.filter(Violation.timestamp >= start)
    if end:
        q = q.filter(Violation.timestamp <= end)
    total = q.count()
    rows = q.order_by(Violation.timestamp.desc()).offset(offset).limit(limit).all()
    return rows, total


def resolve_violation(db: Session, violation_id: int, notes: Optional[str] = None) -> Optional[Violation]:
    vio = db.get(Violation, violation_id)
    if vio is None:
        return None
    vio.resolved = True
    if notes:
        vio.notes = notes
    return vio


# -- analytics --------------------------------------------------------------
def _camera_names() -> dict:
    return {cid: c.get("name") for cid, c in camera_config().items()}


def daily_volume(db: Session, on_date: date_cls) -> dict:
    start = datetime.combine(on_date, datetime.min.time())
    end = start + timedelta(days=1)
    rows = (db.query(Detection.timestamp, Detection.camera_id)
            .filter(and_(Detection.timestamp >= start, Detection.timestamp < end))
            .limit(MAX_ANALYTICS_ROWS).all())

    by_hour = [0] * 24
    by_camera: dict = {}
    for ts, cam in rows:
        by_hour[ts.hour] += 1
        by_camera[cam] = by_camera.get(cam, 0) + 1

    names = _camera_names()
    peak_hour = max(range(24), key=lambda h: by_hour[h]) if rows else None
    return {
        "date": on_date.isoformat(),
        "total": len(rows),
        "peak_hour": peak_hour,
        "by_hour": [{"hour": h, "count": by_hour[h]} for h in range(24)],
        "by_camera": [
            {"camera_id": cid, "camera_name": names.get(cid, cid), "count": cnt}
            for cid, cnt in sorted(by_camera.items(), key=lambda kv: kv[1], reverse=True)
        ],
    }


def violations_summary(db: Session, start: datetime, end: datetime) -> dict:
    rows = (db.query(Violation)
            .filter(and_(Violation.timestamp >= start, Violation.timestamp <= end))
            .limit(MAX_ANALYTICS_ROWS).all())

    by_type: dict = {}
    by_severity: dict = {}
    by_camera: dict = {}
    repeat_by_plate: dict = {}
    for row in rows:
        vtype = row.violation_type
        severity = row.severity or "unknown"
        cam_id = row.camera_id
        cam_name = row.camera_name
        by_type[vtype] = by_type.get(vtype, 0) + 1
        by_severity[severity] = by_severity.get(severity, 0) + 1
        key = (cam_id, cam_name)
        by_camera[key] = by_camera.get(key, 0) + 1

        plate = (row.plate_text or "").upper()
        if not plate:
            continue
        entry = repeat_by_plate.setdefault(plate, {"plate": plate, "violation_count": 0, "dates": set()})
        entry["violation_count"] += 1
        entry["dates"].add(row.timestamp.date().isoformat())

    top_repeat = [
        {
            "plate": entry["plate"],
            "violation_count": entry["violation_count"],
            "dates": sorted(entry["dates"]),
        }
        for entry in sorted(
            repeat_by_plate.values(),
            key=lambda item: (-item["violation_count"], item["plate"]),
        )[:10]
    ]

    return {
        "start": start.isoformat() + "Z",
        "end": end.isoformat() + "Z",
        "total": len(rows),
        "by_type": by_type,
        "by_severity": by_severity,
        "by_camera": [
            {"camera_id": cid, "camera_name": name, "count": cnt}
            for (cid, name), cnt in sorted(by_camera.items(), key=lambda kv: kv[1], reverse=True)
        ],
        "top_10_repeat_offenders": top_repeat,
    }


def purge_old_data(db: Session, now: Optional[datetime] = None) -> dict:
    now = now or datetime.utcnow()
    detection_cutoff = now - timedelta(days=7)
    trajectory_cutoff = now.date() - timedelta(days=30)
    violation_cutoff = now - timedelta(days=90)

    detections_deleted = (
        db.query(Detection)
        .filter(Detection.timestamp < detection_cutoff)
        .delete(synchronize_session=False)
    )
    trajectories_deleted = (
        db.query(Trajectory)
        .filter(Trajectory.date < trajectory_cutoff)
        .delete(synchronize_session=False)
    )
    violations_deleted = (
        db.query(Violation)
        .filter(Violation.timestamp < violation_cutoff)
        .delete(synchronize_session=False)
    )
    return {
        "detections_deleted": detections_deleted,
        "trajectories_deleted": trajectories_deleted,
        "violations_deleted": violations_deleted,
        "cutoff": now.isoformat() + "Z",
    }


def congestion_snapshot(db: Session, window_minutes: int = 10) -> List[dict]:
    since = datetime.utcnow() - timedelta(minutes=window_minutes)
    rows = (db.query(Detection.camera_id, func.count(Detection.detection_id))
            .filter(Detection.timestamp >= since)
            .group_by(Detection.camera_id).all())
    counts = {cid: n for cid, n in rows}
    out = []
    for cid, cam in camera_config().items():
        n = counts.get(cid, 0)
        out.append({
            "camera_id": cid,
            "camera_name": cam.get("name"),
            "position": {"lat": cam.get("latitude"), "lng": cam.get("longitude")},
            "vehicle_count": n,
            "level": _congestion_level(n, window_minutes),
        })
    return out


def _congestion_level(count: int, window_minutes: int) -> str:
    per_min = count / max(window_minutes, 1)
    if per_min >= 8:
        return "high"
    if per_min >= 3:
        return "medium"
    return "low"
