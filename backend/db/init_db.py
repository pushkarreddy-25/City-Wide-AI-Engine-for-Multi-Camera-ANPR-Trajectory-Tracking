"""Database initialization and camera seeding.

Usage:
    python -m db.init_db          # create tables + seed cameras
    python -m db.init_db --reset  # drop everything first (destructive)
"""
import sys

from db.database import Base, engine, SessionLocal
from db import models
from utils.config import cameras as camera_config


def init_db(reset: bool = False, seed: bool = True) -> None:
    if reset:
        Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    if seed:
        seed_cameras()
        seed_incidents()
        seed_audit_logs()


def seed_cameras() -> int:
    """Insert cameras from cameras.yaml if not already present. Returns count added."""
    added = 0
    db = SessionLocal()
    try:
        for cam_id, cfg in camera_config().items():
            if db.get(models.Camera, cam_id):
                continue
            db.add(models.Camera(
                id=cam_id,
                name=cfg.get("name"),
                latitude=cfg.get("latitude"),
                longitude=cfg.get("longitude"),
                rtsp_url=cfg.get("rtsp_url"),
                stop_line_y=cfg.get("stop_line_y"),
                pixels_per_meter=cfg.get("pixels_per_meter"),
                speed_limit_kmh=cfg.get("speed_limit_kmh"),
                lane_boundaries=cfg.get("lanes"),
            ))
            added += 1
        db.commit()
    finally:
        db.close()
    return added


def seed_incidents() -> int:
    added = 0
    db = SessionLocal()
    try:
        if db.query(models.Incident).count() == 0:
            sample_incidents = [
                models.Incident(
                    title="Traffic Congestion at Zero Mile",
                    description="Heavy congestion detected on Eastbound lane; speed dropped under 15 km/h.",
                    severity="High",
                    status="Open",
                    camera_id="CAM-001",
                    camera_name="Zero Mile Intersection",
                    assigned_unit="Traffic Patrol 4"
                ),
                models.Incident(
                    title="Speed Violation Spree",
                    description="Multiple vehicles exceeding 70 km/h in school zone.",
                    severity="Critical",
                    status="Investigating",
                    camera_id="CAM-002",
                    camera_name="Variya Square",
                    assigned_unit="Interceptor 1"
                ),
                models.Incident(
                    title="Stalled Vehicle Reported",
                    description="Stalled SUV blocking left lane near Sitabuldi.",
                    severity="Medium",
                    status="Resolved",
                    camera_id="CAM-003",
                    camera_name="Sitabuldi Flyover",
                    assigned_unit="Tow Truck Unit 2"
                )
            ]
            db.add_all(sample_incidents)
            db.commit()
            added = len(sample_incidents)
    finally:
        db.close()
    return added


def seed_audit_logs() -> int:
    added = 0
    db = SessionLocal()
    try:
        if db.query(models.AuditLog).count() == 0:
            sample_logs = [
                models.AuditLog(
                    user="admin",
                    action="CAMERA_CONFIG_UPDATE",
                    resource="CAM-001",
                    details="Updated speed limit threshold from 50 to 60 km/h.",
                    ip_address="192.168.1.10"
                ),
                models.AuditLog(
                    user="operator_2",
                    action="INCIDENT_DISPATCH",
                    resource="INC-001",
                    details="Dispatched Traffic Patrol 4 to Zero Mile.",
                    ip_address="192.168.1.15"
                ),
                models.AuditLog(
                    user="system",
                    action="AI_ROUTER_MODEL_SWITCH",
                    resource="gpt-4o-mini",
                    details="Switched fallback inference provider to Groq due to rate limits.",
                    ip_address="127.0.0.1"
                )
            ]
            db.add_all(sample_logs)
            db.commit()
            added = len(sample_logs)
    finally:
        db.close()
    return added


if __name__ == "__main__":
    reset = "--reset" in sys.argv
    init_db(reset=reset)
    print(f"Database initialized (reset={reset}). Cameras, incidents, and audit logs seeded.")

