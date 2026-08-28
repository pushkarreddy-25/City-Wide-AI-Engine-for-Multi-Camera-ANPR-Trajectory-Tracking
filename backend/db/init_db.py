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


if __name__ == "__main__":
    reset = "--reset" in sys.argv
    init_db(reset=reset)
    print(f"Database initialized (reset={reset}). Cameras seeded from config.")
