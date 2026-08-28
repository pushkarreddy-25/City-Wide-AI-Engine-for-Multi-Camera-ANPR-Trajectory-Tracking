from datetime import date as date_type
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from sqlalchemy.orm import Session

from api.schemas import LiveVehicle, SearchResults, TrajectoryOut
from db import repository
from db.database import get_db
from services import live_service, report_service

router = APIRouter(prefix="/api/vehicles", tags=["vehicles"])

#: Deep pagination on SQLite walks and discards every preceding row, so an
#: unbounded offset is a free full-table scan per request.
MAX_OFFSET = 10_000

#: Plates are alphanumeric with optional separators. Constraining the shape here
#: keeps junk out of the LIKE pattern and bounds the work a search can request.
PLATE_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9 \-]{0,19}$"
#: Attribute labels ("Truck", "White") come from a fixed vocabulary.
LABEL_PATTERN = r"^[A-Za-z][A-Za-z _\-]{0,31}$"
CAMERA_ID_PATTERN = r"^[A-Za-z0-9_\-]{1,32}$"


@router.get("/live", response_model=List[LiveVehicle], summary="Live vehicle feed")
def live_vehicles(limit: int = Query(50, ge=1, le=200)):
    """Most recent vehicle sightings across all cameras (from the live cache),
    de-duplicated to the newest sighting per track."""
    seen, out = set(), []
    for v in live_service.get_live_vehicles(limit * 2):
        tid = v.get("track_id")
        if tid in seen:
            continue
        seen.add(tid)
        out.append(v)
        if len(out) >= limit:
            break
    return out


@router.get("/search", response_model=SearchResults, summary="Search historical detections")
def search_vehicles(
    plate: Optional[str] = Query(None, min_length=2, max_length=20, pattern=PLATE_PATTERN),
    vehicle_type: Optional[str] = Query(None, alias="type", max_length=32, pattern=LABEL_PATTERN),
    color: Optional[str] = Query(None, max_length=32, pattern=LABEL_PATTERN),
    camera_id: Optional[str] = Query(None, max_length=32, pattern=CAMERA_ID_PATTERN),
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0, le=MAX_OFFSET),
    db: Session = Depends(get_db),
):
    return report_service.vehicle_search(
        db, plate=plate, vehicle_type=vehicle_type, color=color,
        camera_id=camera_id, start=start, end=end, limit=limit, offset=offset)


@router.get("/{plate}/journey", response_model=TrajectoryOut,
            summary="Reconstructed cross-camera journey for a plate")
def vehicle_journey(
    plate: str = Path(..., min_length=2, max_length=20, pattern=PLATE_PATTERN),
    on_date: Optional[date_type] = Query(None, alias="date"),
    db: Session = Depends(get_db),
):
    traj = repository.get_journey(db, plate, on_date)
    if traj is None:
        raise HTTPException(status_code=404, detail="No journey found for that plate")
    return traj.to_dict()
