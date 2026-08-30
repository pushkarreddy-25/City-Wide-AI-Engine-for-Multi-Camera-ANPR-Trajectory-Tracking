"""End-to-end pipeline tests: simulator -> ANPR -> tracking -> violations -> DB.

These exercise the real SQLAlchemy layer against the isolated SQLite database
configured in conftest.py. They require the runtime deps (installed via
``requirements.txt``); ``requirements-dev.txt`` adds pytest.
"""
from datetime import datetime, timedelta

from db import repository
from db.models import Detection, Trajectory, Violation
from linking_module.trajectory_linker import TrajectoryLinker
from services import live_service
from simulation.simulator import TrafficSimulator


def test_simulator_ticks_persist_detections_and_publish_live(db_session):
    """Drive the shared pipeline for a few dozen ticks and confirm it writes
    detections, publishes live state, and produces a congestion snapshot."""
    sim = TrafficSimulator(seed=42)
    for _ in range(30):
        sim.tick(db_session)

    assert db_session.query(Detection).count() > 0

    stats = live_service.get_stats()
    assert stats.get("fleet_size", 0) > 0
    assert "sim_time" in stats

    congestion = repository.congestion_snapshot(db_session)
    assert len(congestion) == 5                     # one cell per configured camera
    for cell in congestion:
        assert cell["level"] in {"low", "medium", "high"}
        assert "position" in cell


def test_simulator_generates_some_violations(db_session):
    """Over enough ticks the scenario rates should yield at least one violation
    of a recognised type."""
    sim = TrafficSimulator(seed=7)
    for _ in range(120):
        sim.tick(db_session)

    rows = db_session.query(Violation).all()
    # violation rates are probabilistic but non-trivial over 120 ticks
    assert len(rows) > 0
    assert all(v.violation_type in {"red_light", "over_speed", "wrong_lane"} for v in rows)


def test_trajectory_roundtrip_through_repository(db_session):
    """Link two sightings into a journey, persist it, and read it back via the
    same query the /journey endpoint uses."""
    linker = TrajectoryLinker()
    t0 = datetime.utcnow()
    dets = [
        {"camera_id": "cam_1", "track_id": "cam_1_track_1", "timestamp": t0,
         "plate": "MH-31-AB-1234", "plate_confidence": 0.95, "type": "Car", "color": "White"},
        {"camera_id": "cam_2", "track_id": "cam_2_track_1", "timestamp": t0 + timedelta(seconds=120),
         "plate": "MH-31-AB-1234", "plate_confidence": 0.90, "type": "Car", "color": "White"},
    ]
    trajs = linker.link(dets)
    assert len(trajs) == 1

    repository.add_trajectory(db_session, trajs[0])
    db_session.commit()

    journey = repository.get_journey(db_session, "MH-31-AB-1234")
    assert journey is not None
    payload = journey.to_dict()
    assert payload["plate"] == "MH-31-AB-1234"
    assert len(payload["sightings"]) == 2
    assert {s["camera_id"] for s in payload["sightings"]} == {"cam_1", "cam_2"}


def test_search_and_resolve_flow(db_session):
    """A stored detection is searchable; a stored violation can be resolved."""
    sim = TrafficSimulator(seed=13)
    for _ in range(60):
        sim.tick(db_session)

    rows, total = repository.search_detections(db_session, limit=10)
    assert total > 0 and len(rows) > 0
    assert rows[0].to_dict()["camera_id"].startswith("cam_")

    vios = db_session.query(Violation).all()
    if vios:
        target = vios[0]
        resolved = repository.resolve_violation(db_session, target.violation_id, notes="reviewed")
        db_session.commit()
        assert resolved.resolved is True
        assert resolved.notes == "reviewed"


def test_average_city_speed_and_speed_summary(db_session):
    """Verify backend calculates average city speed and speed summary correctly from detections."""
    t0 = datetime.utcnow()
    repository.add_detection(db_session, {
        "camera_id": "cam_1", "speed_kmh": 40.0, "timestamp": t0, "plate": "MH-31-AA-1111"
    })
    repository.add_detection(db_session, {
        "camera_id": "cam_2", "speed_kmh": 60.0, "timestamp": t0, "plate": "MH-31-BB-2222"
    })
    db_session.commit()

    avg = repository.average_city_speed(db_session, window_minutes=15)
    assert avg == 50.0

    summary = repository.speed_summary(db_session, window_minutes=15)
    assert summary["avg_city_speed"] == 50.0
    assert summary["sample_count"] == 2
    assert len(summary["by_camera"]) == 5
    cam1 = next(c for c in summary["by_camera"] if c["camera_id"] == "cam_1")
    assert cam1["avg_speed_kmh"] == 40.0
    assert cam1["sample_count"] == 1

