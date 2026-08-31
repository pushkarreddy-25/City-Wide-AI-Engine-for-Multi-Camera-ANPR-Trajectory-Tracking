"""Centralized database access — the only module that builds ORM queries.

Both the API routers and the background simulator go through these functions,
so query shapes and response dicts stay consistent. Time-bucketed analytics are
aggregated in Python (portable across SQLite and PostgreSQL) rather than with
dialect-specific date functions.
"""
from datetime import date as date_cls
from datetime import datetime, timedelta
from typing import List, Optional

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from db.models import Camera, Detection, Sighting, Trajectory, Violation, _iso
from utils.config import cameras as camera_config
from utils.plate import PLATE_SEPARATORS, canonical_plate, strip_separators
from utils.sqlsafe import like_escape

#: Ceiling on rows pulled into Python by the portable (non-SQL) aggregations
#: below. Generous enough for a month of real traffic, but it stops a wide
#: ``?hours=720`` window from turning into unbounded memory growth.
MAX_ANALYTICS_ROWS = 500_000

#: A vehicle re-detected at the same camera inside this window is the same pass,
#: not a second visit. Used when synthesising journey stops from raw detections.
STOP_GAP_MINUTES = 10

#: How far a violation may sit from a sighting's timestamp and still be treated
#: as having happened *at that stop*.
VIOLATION_MATCH_MINUTES = 10


# -- plate matching ---------------------------------------------------------
def _plate_bare(column):
    """SQL expression yielding a column's plate with separators removed.

    ``REPLACE`` and ``UPPER`` exist on both SQLite and PostgreSQL, so this stays
    portable. It cannot use the plate index, which is why the exact-match helper
    below tries indexed equality first.
    """
    expr = func.upper(column)
    for sep in PLATE_SEPARATORS:
        expr = func.replace(expr, sep, "")
    return expr


def plate_matches(column, plate: str):
    """Separator-insensitive equality filter for a stored plate column.

    Plates are stored hyphenated (``MH-31-AB-1234``) but arrive from the UI in
    whatever shape the operator typed (``mh31ab1234``, ``MH 31 AB 1234``). A
    plain ``==`` on either form misses, which is why journey lookups silently
    404'd. When the input is a complete plate we compare against the canonical
    hyphenated form first so the index is usable, and fall back to a
    ``REPLACE()`` comparison for rows stored in some other shape.
    """
    bare = strip_separators(plate)
    clauses = [_plate_bare(column) == bare]
    canonical = canonical_plate(plate)
    if canonical:
        clauses.insert(0, column == canonical)
    return or_(*clauses)


def plate_contains(column, fragment: str):
    """Separator-insensitive ``LIKE '%fragment%'`` filter for partial plates."""
    pattern = f"%{like_escape(strip_separators(fragment))}%"
    return _plate_bare(column).like(pattern, escape="\\")


def _day_bounds(date_from: Optional[date_cls], date_to: Optional[date_cls]):
    """Convert an inclusive date range to half-open datetime bounds.

    Comparing against the indexed ``timestamp`` column beats wrapping it in
    ``date()``, which forces a scan, and makes ``date_to`` cover its whole day.
    """
    start = datetime.combine(date_from, datetime.min.time()) if date_from else None
    end = datetime.combine(date_to + timedelta(days=1), datetime.min.time()) if date_to else None
    return start, end


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
        q = q.filter(plate_contains(Detection.plate_text, plate))
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
    q = db.query(Trajectory).filter(plate_matches(Trajectory.plate_text, plate))
    if on_date:
        q = q.filter(Trajectory.date == on_date)
    return q.order_by(Trajectory.date.desc(), Trajectory.trajectory_id.desc()).first()


def search_journeys(
    db: Session,
    plate_fragment: str,
    date_from: Optional[date_cls] = None,
    date_to: Optional[date_cls] = None,
    camera_id: Optional[str] = None,
    limit: int = 20,
) -> list:
    """Search trajectories by partial plate, ignoring separators and case."""
    q = db.query(Trajectory).filter(plate_contains(Trajectory.plate_text, plate_fragment))
    if date_from:
        q = q.filter(Trajectory.date >= date_from)
    if date_to:
        q = q.filter(Trajectory.date <= date_to)
    if camera_id:
        # filter trajectories that have at least one sighting on this camera
        q = q.join(Sighting, Sighting.trajectory_id == Trajectory.trajectory_id).filter(
            Sighting.camera_id == camera_id
        ).distinct()
    return q.order_by(Trajectory.date.desc(), Trajectory.trajectory_id.desc()).limit(limit).all()


def raw_detections_for_plate(
    db: Session,
    plate: str,
    date_from: Optional[date_cls] = None,
    date_to: Optional[date_cls] = None,
    camera_id: Optional[str] = None,
    limit: int = 500,
) -> List[Detection]:
    """Every detection of a plate in ascending time order.

    Shared by the journey fallback and by the speed enrichment that fills in the
    per-stop readings ``sightings`` rows do not store.
    """
    q = db.query(Detection).filter(plate_matches(Detection.plate_text, plate))
    start, end = _day_bounds(date_from, date_to)
    if start:
        q = q.filter(Detection.timestamp >= start)
    if end:
        q = q.filter(Detection.timestamp < end)
    if camera_id:
        q = q.filter(Detection.camera_id == camera_id)
    return q.order_by(Detection.timestamp.asc()).limit(limit).all()


def detections_for_plate(
    db: Session,
    plate: str,
    date_from: Optional[date_cls] = None,
    date_to: Optional[date_cls] = None,
    camera_id: Optional[str] = None,
    limit: int = 200,
) -> list:
    """Fetch raw Detection rows for a plate and synthesise a sightings list.

    This is the fallback when no Trajectory row has been persisted yet — the
    ``TrajectoryLinker`` only writes one once it has linked two or more
    sightings, so a plate can be well attested in ``detections`` and absent from
    ``trajectories``. The caller gets a dict shaped like
    :meth:`Trajectory.to_dict` (plus ``is_approximate``) so the frontend renders
    it identically.

    Consecutive detections at the same camera are collapsed into a single stop
    when they fall within :data:`STOP_GAP_MINUTES`, which is what separates one
    pass under a camera from a genuine second visit.
    """
    rows = raw_detections_for_plate(
        db, plate, date_from=date_from, date_to=date_to,
        camera_id=camera_id, limit=limit,
    )
    if not rows:
        return []

    cfg = camera_config()
    sightings: List[dict] = []
    for det in rows:
        cam_cfg = cfg.get(det.camera_id, {})
        previous = sightings[-1] if sightings else None
        same_pass = (
            previous is not None
            and previous["camera_id"] == det.camera_id
            and det.timestamp is not None
            and previous["_last_ts"] is not None
            and (det.timestamp - previous["_last_ts"]) <= timedelta(minutes=STOP_GAP_MINUTES)
        )
        if same_pass:
            # Same pass: keep the first timestamp, but remember the fastest read.
            previous["_last_ts"] = det.timestamp
            if det.speed_kmh and (previous["speed_kmh"] is None or det.speed_kmh > previous["speed_kmh"]):
                previous["speed_kmh"] = round(float(det.speed_kmh), 1)
            continue

        sightings.append({
            "camera_id": det.camera_id,
            "camera_name": cam_cfg.get("name") or det.camera_id,
            "timestamp": _iso(det.timestamp),
            "position": {"lat": cam_cfg.get("latitude"), "lng": cam_cfg.get("longitude")},
            "direction": None,
            "speed_kmh": round(float(det.speed_kmh), 1) if det.speed_kmh else None,
            "_last_ts": det.timestamp,
        })

    for s in sightings:
        s.pop("_last_ts", None)

    first = rows[0]
    return [{
        "trajectory_id": None,
        # Echo the plate as *stored*, not as typed, so the UI shows MH-31-AB-1234.
        "plate": first.plate_text,
        "date": first.timestamp.date().isoformat() if first.timestamp else None,
        "type": first.vehicle_type,
        "color": first.vehicle_color,
        "sightings": sightings,
        "is_approximate": True,
    }]


def violations_for_plate(
    db: Session,
    plate: str,
    date_from: Optional[date_cls] = None,
    date_to: Optional[date_cls] = None,
    limit: int = 50,
) -> list:
    """Return a plate's violations, newest first, optionally date-scoped."""
    q = db.query(Violation).filter(plate_matches(Violation.plate_text, plate))
    start, end = _day_bounds(date_from, date_to)
    if start:
        q = q.filter(Violation.timestamp >= start)
    if end:
        q = q.filter(Violation.timestamp < end)
    rows = q.order_by(Violation.timestamp.desc()).limit(limit).all()
    return [v.to_dict() for v in rows]


def enrich_sightings_with_speed(db: Session, plate: str, sightings: list,
                                 date_from: Optional[date_cls] = None,
                                 date_to: Optional[date_cls] = None) -> list:
    """Fill in speed_kmh for sightings by joining raw detections on camera + time.

    Sighting rows have no speed column, but the UI needs it for the timeline,
    popups, and average-speed KPI. We look up the detection nearest each
    sighting's timestamp (within ±5 minutes) and copy its speed reading.
    """
    detections = raw_detections_for_plate(db, plate, date_from=date_from, date_to=date_to)
    if not detections:
        return sightings

    # Build a map: camera_id → [(timestamp, speed), ...]
    det_map = {}
    for d in detections:
        if d.timestamp and d.camera_id:
            det_map.setdefault(d.camera_id, []).append((d.timestamp, d.speed_kmh))

    enriched = []
    for s in sightings:
        s = dict(s)  # shallow copy so we don't mutate the input
        cam = s.get("camera_id")
        ts_str = s.get("timestamp")
        if cam and ts_str and cam in det_map:
            try:
                ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00")).replace(tzinfo=None)
            except (ValueError, AttributeError):
                enriched.append(s)
                continue

            best_speed = None
            best_delta = timedelta(minutes=5)
            for det_ts, det_speed in det_map[cam]:
                delta = abs(det_ts - ts)
                if delta <= best_delta and det_speed is not None:
                    best_delta = delta
                    best_speed = det_speed

            if best_speed is not None and s.get("speed_kmh") is None:
                s["speed_kmh"] = round(float(best_speed), 1)
        enriched.append(s)

    return enriched


def attach_violations_to_sightings(sightings: list, violations: list) -> list:
    """Attach violations to the sighting they occurred at (by camera + time proximity).

    A violation is matched to a sighting if it shares the same camera and happened
    within :data:`VIOLATION_MATCH_MINUTES` of the sighting timestamp. This gives
    the UI per-stop violation markers rather than a flat list.
    """
    enriched = []
    for s in sightings:
        s = dict(s)  # shallow copy
        cam = s.get("camera_id")
        ts_str = s.get("timestamp")
        if not cam or not ts_str:
            enriched.append(s)
            continue

        try:
            ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            enriched.append(s)
            continue

        matched = []
        for v in violations:
            if v.get("camera_id") != cam:
                continue
            vts_str = v.get("timestamp")
            if not vts_str:
                continue
            try:
                vts = datetime.fromisoformat(vts_str.replace("Z", "+00:00"))
            except (ValueError, AttributeError):
                continue
            if abs((vts - ts).total_seconds()) <= VIOLATION_MATCH_MINUTES * 60:
                matched.append(v)

        if matched:
            s["violations"] = matched
        enriched.append(s)

    return enriched


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


def average_city_speed(db: Session, window_minutes: int = 15) -> Optional[float]:
    """Compute the mean speed (km/h) across active vehicles in the window.

    Falls back to recent detections if the live window contains no detections.
    """
    since = datetime.utcnow() - timedelta(minutes=window_minutes)
    avg_speed = (
        db.query(func.avg(Detection.speed_kmh))
        .filter(
            Detection.timestamp >= since,
            Detection.speed_kmh.isnot(None),
            Detection.speed_kmh > 0,
        )
        .scalar()
    )
    if avg_speed is not None:
        return round(float(avg_speed), 1)

    recent_rows = (
        db.query(Detection.speed_kmh)
        .filter(Detection.speed_kmh.isnot(None), Detection.speed_kmh > 0)
        .order_by(Detection.timestamp.desc())
        .limit(100)
        .all()
    )
    if recent_rows:
        speeds = [float(r[0]) for r in recent_rows if r[0] is not None]
        if speeds:
            return round(sum(speeds) / len(speeds), 1)
    return None


def speed_summary(db: Session, window_minutes: int = 15) -> dict:
    """Compute overall and per-camera speed statistics over a time window."""
    since = datetime.utcnow() - timedelta(minutes=window_minutes)
    rows = (
        db.query(
            Detection.camera_id,
            func.avg(Detection.speed_kmh),
            func.count(Detection.detection_id),
        )
        .filter(
            Detection.timestamp >= since,
            Detection.speed_kmh.isnot(None),
            Detection.speed_kmh > 0,
        )
        .group_by(Detection.camera_id)
        .all()
    )
    cam_stats = {cid: (float(avg) if avg else None, int(cnt)) for cid, avg, cnt in rows}
    cams_cfg = camera_config()
    by_camera = []
    total_samples = 0
    total_speed_sum = 0.0

    for cid, cam in cams_cfg.items():
        avg_s, cnt = cam_stats.get(cid, (None, 0))
        if avg_s is not None and cnt > 0:
            total_samples += cnt
            total_speed_sum += avg_s * cnt
        by_camera.append({
            "camera_id": cid,
            "camera_name": cam.get("name"),
            "avg_speed_kmh": round(avg_s, 1) if avg_s is not None else None,
            "sample_count": cnt,
            "posted_limit": cam.get("speed_limit_kmh"),
        })

    avg_city = round(total_speed_sum / total_samples, 1) if total_samples > 0 else None
    if avg_city is None:
        avg_city = average_city_speed(db, window_minutes=window_minutes)

    return {
        "avg_city_speed": avg_city,
        "sample_count": total_samples,
        "window_minutes": window_minutes,
        "by_camera": by_camera,
    }


def system_diagnostics(db: Session) -> dict:
    """Return operational database statistics, retention windows, and engine status."""
    return {
        "status": "healthy",
        "counts": {
            "detections": db.query(Detection).count(),
            "trajectories": db.query(Trajectory).count(),
            "violations": db.query(Violation).count(),
            "cameras": db.query(Camera).count(),
        },
        "retention": {
            "detections_days": 7,
            "trajectories_days": 30,
            "violations_days": 90,
        },
        "anpr_engine": {
            "default_confidence_threshold": 0.65,
            "speed_tolerance_kmh": 5.0,
            "tracked_cameras": len(camera_config()),
        },
    }


