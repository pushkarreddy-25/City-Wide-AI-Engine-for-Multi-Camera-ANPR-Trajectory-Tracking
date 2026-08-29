from core.events import EventBus, JobQueue
from db.database import SessionLocal
from simulation.simulator import TrafficSimulator, Trip
from services.runtime_service import runtime_services


def test_event_bus_roundtrip():
    bus = EventBus()
    seen = []

    def handler(event):
        seen.append(event["camera_id"])

    bus.subscribe("camera.frame", handler)
    bus.publish("camera.frame", {"camera_id": "cam_1"})

    assert seen == ["cam_1"]


def test_job_queue_roundtrip():
    queue = JobQueue()
    queue.put({"type": "camera.frame", "payload": {"camera_id": "cam_2"}})

    job = queue.get(timeout=0.1)
    assert job["type"] == "camera.frame"
    assert job["payload"]["camera_id"] == "cam_2"


def test_simulator_routes_frames_to_runtime_services(monkeypatch, fresh_db):
    fresh_db()
    sim = TrafficSimulator(seed=7)
    camera_id = next(iter(sim.cameras))
    vehicle = sim.fleet[0]
    trip = Trip(
        vehicle=vehicle,
        route=[camera_id, next(iter(sim.graph[camera_id]))],
        leg=0,
        phase="at_camera",
        dwell=1,
        visit={
            "speed": 35.0,
            "signal": "green",
            "lane_violation": False,
            "obscured": False,
            "lane": 0,
            "bbox": (10, 20, 120, 100),
        },
    )
    sim.active = [trip]
    sim.idle = []
    sim.sim["spawn_probability"] = 0.0
    sim.sim["max_active"] = 0

    emitted = []

    def fake_emit_frame(camera_id_arg, frame, **metadata):
        emitted.append({"camera_id": camera_id_arg, "frame": frame, **metadata})

    monkeypatch.setattr(runtime_services, "started", True, raising=False)
    monkeypatch.setattr(runtime_services, "emit_frame", fake_emit_frame)
    monkeypatch.setattr(sim, "_advance", lambda db: None)
    monkeypatch.setattr(sim, "_spawn", lambda: None)

    with fresh_db() as db:
        sim.tick(db)

    assert emitted
    assert emitted[0]["camera_id"] == camera_id
    assert emitted[0]["frame"]
    assert "timestamp" in emitted[0]
