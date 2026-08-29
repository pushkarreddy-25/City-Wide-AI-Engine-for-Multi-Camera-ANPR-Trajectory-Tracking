from core.events import EventBus, JobQueue


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
