from typing import List, Optional

from pydantic import BaseModel

from api.schemas.common import BBox, Position


class LiveVehicle(BaseModel):
    camera_id: Optional[str] = None
    camera_name: Optional[str] = None
    track_id: Optional[str] = None
    plate: Optional[str] = None
    plate_confidence: Optional[float] = None
    type: Optional[str] = None
    color: Optional[str] = None
    speed_kmh: Optional[float] = None
    valid_plate: Optional[bool] = None
    position: Position = Position()
    timestamp: Optional[str] = None


class DetectionOut(BaseModel):
    detection_id: Optional[int] = None
    camera_id: Optional[str] = None
    track_id: Optional[str] = None
    timestamp: Optional[str] = None
    plate: Optional[str] = None
    plate_confidence: Optional[float] = None
    type: Optional[str] = None
    color: Optional[str] = None
    speed_kmh: Optional[float] = None
    bbox: BBox = BBox()


class SearchResults(BaseModel):
    total: int = 0
    limit: int = 100
    offset: int = 0
    results: List[DetectionOut] = []


class SightingOut(BaseModel):
    camera_id: Optional[str] = None
    camera_name: Optional[str] = None
    timestamp: Optional[str] = None
    position: Position = Position()
    direction: Optional[str] = None


class TrajectoryOut(BaseModel):
    trajectory_id: Optional[int] = None
    plate: Optional[str] = None
    date: Optional[str] = None
    type: Optional[str] = None
    color: Optional[str] = None
    sightings: List[SightingOut] = []
