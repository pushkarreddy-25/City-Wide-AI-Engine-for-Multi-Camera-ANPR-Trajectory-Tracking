"""Pydantic response/request schemas for the API (also power the Swagger docs)."""
from api.schemas.common import BBox, Pagination, Position
from api.schemas.vehicles import (
    DetectionOut, LiveVehicle, SearchResults, SightingOut, TrajectoryOut,
)
from api.schemas.violations import (
    CameraViolationCount, ViolationList, ViolationOut, ViolationsSummaryOut,
)
from api.schemas.analytics import (
    CameraOut, CameraCount, CongestionCell, DailyVolumeOut, HourCount,
)

__all__ = [
    "BBox", "Pagination", "Position",
    "DetectionOut", "LiveVehicle", "SearchResults", "SightingOut", "TrajectoryOut",
    "CameraViolationCount", "ViolationList", "ViolationOut", "ViolationsSummaryOut",
    "CameraOut", "CameraCount", "CongestionCell", "DailyVolumeOut", "HourCount",
]
