from typing import Dict, List, Optional

from pydantic import BaseModel


class ViolationOut(BaseModel):
    violation_id: Optional[str] = None
    type: Optional[str] = None
    plate: Optional[str] = None
    camera_id: Optional[str] = None
    camera_name: Optional[str] = None
    timestamp: Optional[str] = None
    severity: Optional[str] = None
    confidence: Optional[float] = None
    speed_kmh: Optional[float] = None
    posted_limit: Optional[float] = None
    evidence_image_url: Optional[str] = None
    resolved: bool = False
    notes: Optional[str] = None


class ViolationList(BaseModel):
    total: int = 0
    limit: int = 50
    offset: int = 0
    alerts: List[ViolationOut] = []


class CameraViolationCount(BaseModel):
    camera_id: Optional[str] = None
    camera_name: Optional[str] = None
    count: int = 0


class ViolationsSummaryOut(BaseModel):
    start: Optional[str] = None
    end: Optional[str] = None
    total: int = 0
    by_type: Dict[str, int] = {}
    by_severity: Dict[str, int] = {}
    by_camera: List[CameraViolationCount] = []
