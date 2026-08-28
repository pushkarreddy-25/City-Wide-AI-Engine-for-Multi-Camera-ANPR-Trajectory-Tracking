from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from api.schemas import CameraOut
from db.database import get_db
from db.models import Camera
from utils.config import cameras as camera_config

router = APIRouter(prefix="/api/cameras", tags=["cameras"])


@router.get("", response_model=List[CameraOut], summary="List all cameras")
def list_cameras(db: Session = Depends(get_db)):
    rows = db.query(Camera).all()
    if rows:
        return [r.to_dict() for r in rows]
    # fallback to config if the DB has not been seeded yet
    return [{
        "id": cid,
        "name": c.get("name"),
        "position": {"lat": c.get("latitude"), "lng": c.get("longitude")},
        "speed_limit_kmh": c.get("speed_limit_kmh"),
        "lanes": c.get("lanes", []),
    } for cid, c in camera_config().items()]
