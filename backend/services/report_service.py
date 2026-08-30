"""Analytics/report service — shapes repository output for the API.

Live congestion prefers the cache snapshot (published every tick by the
simulator) and falls back to a DB query if the cache is cold.
"""
from datetime import date as date_cls
from datetime import datetime, timedelta
from typing import Optional

from db import repository
from services import live_service


def daily_volume(db, on_date: Optional[date_cls] = None) -> dict:
    return repository.daily_volume(db, on_date or datetime.utcnow().date())


def violations_summary(db, start: Optional[datetime] = None, end: Optional[datetime] = None,
                       hours: int = 24) -> dict:
    end = end or datetime.utcnow()
    start = start or (end - timedelta(hours=hours))
    return repository.violations_summary(db, start, end)


def congestion(db, window_minutes: int = 10) -> list:
    cached = live_service.get_congestion()
    if cached:
        return cached
    return repository.congestion_snapshot(db, window_minutes)


def vehicle_search(db, **filters) -> dict:
    limit = filters.pop("limit", 100)
    offset = filters.pop("offset", 0)
    rows, total = repository.search_detections(db, limit=limit, offset=offset, **filters)
    return {"total": total, "limit": limit, "offset": offset,
            "results": [r.to_dict() for r in rows]}


def average_city_speed(db, window_minutes: int = 15) -> Optional[float]:
    return repository.average_city_speed(db, window_minutes=window_minutes)


def speed_summary(db, window_minutes: int = 15) -> dict:
    return repository.speed_summary(db, window_minutes=window_minutes)


def system_diagnostics(db) -> dict:
    return repository.system_diagnostics(db)


def normalise_plate(plate: str) -> str:
    """Strip spaces/dashes, uppercase — 'mh 31 ab 1234' → 'MH31AB1234'."""
    import re
    return re.sub(r"[\s\-]", "", plate).upper()


def journey_search(
    db,
    plate: str,
    date_from=None,
    date_to=None,
    on_date=None,
    camera_id: str = None,
) -> dict:
    """Look up a vehicle journey.

    Strategy:
    1. Try exact plate match on Trajectory table (possibly date-filtered).
    2. Fall back to raw Detection rows, synthesising sightings from them.
    3. Enrich sightings with speed readings from detections.
    4. Attach violations to each sighting by camera + time proximity.
    5. Also include a top-level violations list scoped to the journey window.

    Returns a dict compatible with the TrajectoryOut schema plus extra keys
    ``is_approximate``, ``violations`` (top-level list), and per-sighting
    ``violations`` arrays when a violation occurred at that stop.
    """
    plate_norm = normalise_plate(plate)

    # 1 — Try trajectory table (exact plate, newest first)
    traj = repository.get_journey(db, plate_norm, on_date)
    if traj is None and not on_date:
        # Also try with LIKE in case the plate was stored differently
        hits = repository.search_journeys(
            db, plate_fragment=plate_norm,
            date_from=date_from, date_to=date_to,
            camera_id=camera_id, limit=1,
        )
        traj = hits[0] if hits else None

    if traj is not None:
        result = traj.to_dict()
        result["is_approximate"] = False
        # Use the trajectory's own date to scope violations to the trip window
        date_from = traj.date
        date_to = traj.date
    else:
        # 2 — Detection fallback
        approx = repository.detections_for_plate(
            db, plate_norm,
            date_from=date_from, date_to=date_to,
            camera_id=camera_id,
        )
        if not approx:
            return None
        result = approx[0]

    # 3 — Enrich sightings with speed
    sightings = result.get("sightings", [])
    sightings = repository.enrich_sightings_with_speed(
        db, plate_norm, sightings,
        date_from=date_from, date_to=date_to,
    )

    # 4 — Fetch violations scoped to the journey window
    violations = repository.violations_for_plate(
        db, plate_norm,
        date_from=date_from, date_to=date_to,
    )

    # 5 — Attach violations to their stops
    sightings = repository.attach_violations_to_sightings(sightings, violations)

    result["sightings"] = sightings
    result["violations"] = violations
    return result


def search_journeys(db, plate_fragment: str, date_from=None, date_to=None,
                    camera_id: str = None, limit: int = 20) -> list:
    """Return a list of trajectory summaries matching a partial plate."""
    frag = normalise_plate(plate_fragment)
    hits = repository.search_journeys(db, frag, date_from=date_from,
                                      date_to=date_to, camera_id=camera_id, limit=limit)
    return [
        {
            "trajectory_id": t.trajectory_id,
            "plate": t.plate_text,
            "date": t.date.isoformat() if t.date else None,
            "type": t.vehicle_type,
            "color": t.vehicle_color,
            "sighting_count": len(t.sightings),
        }
        for t in hits
    ]



