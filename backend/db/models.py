"""SQLAlchemy ORM models mirroring the architecture document's schema.

JSON columns (lane boundaries) are stored as TEXT on SQLite and as native
JSON on PostgreSQL, so the same models work on both backends.
"""
from datetime import datetime

from sqlalchemy import (
    Boolean, Column, Date, DateTime, Float, ForeignKey, Index, Integer, JSON, String,
)
from sqlalchemy.orm import relationship

from db.database import Base


def _iso(dt):
    """Serialize a naive-UTC datetime as an ISO-8601 string with 'Z'."""
    if dt is None:
        return None
    return dt.replace(microsecond=(dt.microsecond // 1000) * 1000).isoformat() + "Z"


class Camera(Base):
    __tablename__ = "cameras"

    id = Column(String(50), primary_key=True)
    name = Column(String(120))
    latitude = Column(Float)
    longitude = Column(Float)
    rtsp_url = Column(String(255))
    stop_line_y = Column(Float)
    pixels_per_meter = Column(Float)
    speed_limit_kmh = Column(Float)
    lane_boundaries = Column(JSON)          # list of lane-boundary x-coordinates
    created_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "position": {"lat": self.latitude, "lng": self.longitude},
            "speed_limit_kmh": self.speed_limit_kmh,
            "lanes": self.lane_boundaries or [],
        }


class Detection(Base):
    __tablename__ = "detections"

    detection_id = Column(Integer, primary_key=True, autoincrement=True)
    camera_id = Column(String(50), ForeignKey("cameras.id"), index=True)
    track_id = Column(String(60), index=True)
    timestamp = Column(DateTime, nullable=False, index=True)
    plate_text = Column(String(20), index=True)
    plate_confidence = Column(Float)
    vehicle_type = Column(String(30))
    vehicle_color = Column(String(30))
    speed_kmh = Column(Float)
    bbox_x1 = Column(Float)
    bbox_y1 = Column(Float)
    bbox_x2 = Column(Float)
    bbox_y2 = Column(Float)
    image_path = Column(String(255))

    __table_args__ = (
        Index("ix_det_plate_ts", "plate_text", "timestamp"),
        Index("ix_det_cam_ts", "camera_id", "timestamp"),
    )

    def to_dict(self):
        return {
            "detection_id": self.detection_id,
            "camera_id": self.camera_id,
            "track_id": self.track_id,
            "timestamp": _iso(self.timestamp),
            "plate": self.plate_text,
            "plate_confidence": round(self.plate_confidence, 3) if self.plate_confidence else None,
            "type": self.vehicle_type,
            "color": self.vehicle_color,
            "speed_kmh": round(self.speed_kmh, 1) if self.speed_kmh else None,
            "bbox": {"x1": self.bbox_x1, "y1": self.bbox_y1, "x2": self.bbox_x2, "y2": self.bbox_y2},
        }


class Trajectory(Base):
    __tablename__ = "trajectories"

    trajectory_id = Column(Integer, primary_key=True, autoincrement=True)
    plate_text = Column(String(20), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    vehicle_type = Column(String(30))
    vehicle_color = Column(String(30))
    created_at = Column(DateTime, default=datetime.utcnow)

    sightings = relationship(
        "Sighting", back_populates="trajectory",
        cascade="all, delete-orphan", order_by="Sighting.timestamp",
    )

    __table_args__ = (Index("ix_traj_plate_date", "plate_text", "date"),)

    def to_dict(self):
        return {
            "trajectory_id": self.trajectory_id,
            "plate": self.plate_text,
            "date": self.date.isoformat() if self.date else None,
            "type": self.vehicle_type,
            "color": self.vehicle_color,
            "sightings": [s.to_dict() for s in self.sightings],
        }


class Sighting(Base):
    __tablename__ = "sightings"

    sighting_id = Column(Integer, primary_key=True, autoincrement=True)
    trajectory_id = Column(Integer, ForeignKey("trajectories.trajectory_id"), index=True)
    camera_id = Column(String(50), ForeignKey("cameras.id"))
    camera_name = Column(String(120))
    timestamp = Column(DateTime, index=True)
    latitude = Column(Float)
    longitude = Column(Float)
    direction = Column(String(20))

    trajectory = relationship("Trajectory", back_populates="sightings")

    def to_dict(self):
        return {
            "camera_id": self.camera_id,
            "camera_name": self.camera_name,
            "timestamp": _iso(self.timestamp),
            "position": {"lat": self.latitude, "lng": self.longitude},
            "direction": self.direction,
        }


class Violation(Base):
    __tablename__ = "violations"

    violation_id = Column(Integer, primary_key=True, autoincrement=True)
    violation_type = Column(String(30), index=True)
    plate_text = Column(String(20), index=True)
    camera_id = Column(String(50), ForeignKey("cameras.id"))
    camera_name = Column(String(120))
    timestamp = Column(DateTime, nullable=False, index=True)
    severity = Column(String(20))
    confidence = Column(Float)
    speed_kmh = Column(Float)
    posted_limit = Column(Float)
    image_path = Column(String(255))
    resolved = Column(Boolean, default=False)
    notes = Column(String(500))
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_vio_plate_ts", "plate_text", "timestamp"),
        Index("ix_vio_type_ts", "violation_type", "timestamp"),
    )

    def to_dict(self):
        return {
            "violation_id": f"vio_{self.violation_id}",
            "type": self.violation_type,
            "plate": self.plate_text,
            "camera_id": self.camera_id,
            "camera_name": self.camera_name,
            "timestamp": _iso(self.timestamp),
            "severity": self.severity,
            "confidence": round(self.confidence, 3) if self.confidence else None,
            "speed_kmh": round(self.speed_kmh, 1) if self.speed_kmh else None,
            "posted_limit": self.posted_limit,
            "evidence_image_url": self.image_path,
            "resolved": bool(self.resolved),
            "notes": self.notes,
        }
