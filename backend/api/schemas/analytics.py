from typing import List, Optional

from pydantic import BaseModel

from api.schemas.common import Position


class HourCount(BaseModel):
    hour: int
    count: int = 0


class CameraCount(BaseModel):
    camera_id: Optional[str] = None
    camera_name: Optional[str] = None
    count: int = 0


class DailyVolumeOut(BaseModel):
    date: Optional[str] = None
    total: int = 0
    peak_hour: Optional[int] = None
    by_hour: List[HourCount] = []
    by_camera: List[CameraCount] = []


class CongestionCell(BaseModel):
    camera_id: Optional[str] = None
    camera_name: Optional[str] = None
    position: Position = Position()
    vehicle_count: int = 0
    level: str = "low"


class CameraOut(BaseModel):
    id: Optional[str] = None
    name: Optional[str] = None
    position: Position = Position()
    speed_limit_kmh: Optional[float] = None
    lanes: List[float] = []


class LiveStatsOut(BaseModel):
    active_vehicles: Optional[int] = None
    fleet_size: Optional[int] = None
    sim_time: Optional[str] = None
    avg_city_speed: Optional[float] = None


class CameraSpeedStat(BaseModel):
    camera_id: Optional[str] = None
    camera_name: Optional[str] = None
    avg_speed_kmh: Optional[float] = None
    sample_count: int = 0
    posted_limit: Optional[float] = None


class SpeedSummaryOut(BaseModel):
    avg_city_speed: Optional[float] = None
    sample_count: int = 0
    window_minutes: int = 15
    by_camera: List[CameraSpeedStat] = []

