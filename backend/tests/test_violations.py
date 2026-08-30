"""Rule-based violation-detection tests (violations.detector)."""
from datetime import datetime, timedelta

from db import repository
from violations.detector import (
    OVER_SPEED, PARKING_VIOLATION, RED_LIGHT, WRONG_LANE, ViolationDetector,
)

T0 = datetime(2026, 1, 1, 12, 0, 0)


def _det(camera_id="cam_1", bbox=(100, 380, 180, 450), speed=None,
         plate="MH-31-AB-1234", conf=1.0):
    return {"camera_id": camera_id, "bbox": bbox, "speed_kmh": speed,
            "plate": plate, "plate_confidence": conf, "timestamp": T0}


def _types(violations):
    return {v["violation_type"] for v in violations}


def test_red_light_when_signal_red_and_stop_line_crossed(sample_cameras):
    det = ViolationDetector(sample_cameras)
    # bbox y2=450 >= stop_line_y (430) -> crossed
    out = det.evaluate(_det(bbox=(100, 380, 180, 450)), {"signal_state": "red"})
    assert RED_LIGHT in _types(out)
    red = next(v for v in out if v["violation_type"] == RED_LIGHT)
    assert red["severity"] == "high"


def test_no_red_light_on_green(sample_cameras):
    det = ViolationDetector(sample_cameras)
    out = det.evaluate(_det(bbox=(100, 380, 180, 450)), {"signal_state": "green"})
    assert RED_LIGHT not in _types(out)


def test_no_red_light_if_stop_line_not_crossed(sample_cameras):
    det = ViolationDetector(sample_cameras)
    # bbox y2=400 < stop_line_y (430) -> stopped before the line
    out = det.evaluate(_det(bbox=(100, 320, 180, 400)), {"signal_state": "red"})
    assert RED_LIGHT not in _types(out)


def test_over_speed_high_severity_when_20_over(sample_cameras):
    det = ViolationDetector(sample_cameras, speed_tolerance_kmh=5)
    out = det.evaluate(_det(speed=80))          # limit 50, 30 over
    speeding = next(v for v in out if v["violation_type"] == OVER_SPEED)
    assert speeding["severity"] == "high"
    assert speeding["speed_kmh"] == 80
    assert speeding["posted_limit"] == 50


def test_over_speed_medium_severity_when_slightly_over(sample_cameras):
    det = ViolationDetector(sample_cameras, speed_tolerance_kmh=5)
    out = det.evaluate(_det(speed=61))          # limit 50, 11 over -> medium
    speeding = next(v for v in out if v["violation_type"] == OVER_SPEED)
    assert speeding["severity"] == "medium"


def test_no_over_speed_within_tolerance(sample_cameras):
    det = ViolationDetector(sample_cameras, speed_tolerance_kmh=5)
    out = det.evaluate(_det(speed=54))          # 50 + 5 tolerance = 55 threshold
    assert OVER_SPEED not in _types(out)


def test_wrong_lane_from_context(sample_cameras):
    det = ViolationDetector(sample_cameras)
    out = det.evaluate(_det(), {"lane_violation": True})
    assert WRONG_LANE in _types(out)


def test_multiple_violations_in_one_pass(sample_cameras):
    det = ViolationDetector(sample_cameras, speed_tolerance_kmh=5)
    out = det.evaluate(_det(bbox=(100, 380, 180, 450), speed=90),
                       {"signal_state": "red", "lane_violation": True})
    assert _types(out) == {RED_LIGHT, OVER_SPEED, WRONG_LANE}


def test_clean_vehicle_has_no_violations(sample_cameras):
    det = ViolationDetector(sample_cameras, speed_tolerance_kmh=5)
    out = det.evaluate(_det(bbox=(100, 320, 180, 400), speed=40),
                       {"signal_state": "green"})
    assert out == []


def test_confidence_scales_with_plate_confidence(sample_cameras):
    det = ViolationDetector(sample_cameras)
    strong = det.evaluate(_det(speed=80, conf=1.0))[0]
    weak = det.evaluate(_det(speed=80, conf=0.0))[0]
    assert strong["confidence"] == 0.99
    assert weak["confidence"] == 0.6
    assert strong["confidence"] > weak["confidence"]


def test_evidence_path_is_populated(sample_cameras):
    det = ViolationDetector(sample_cameras)
    out = det.evaluate(_det(speed=80))
    assert out[0]["image_path"].startswith("evidence/cam_1/")


def test_parking_violation_when_stationary_in_no_parking_zone(sample_cameras):
    det = ViolationDetector(sample_cameras)
    out = det.evaluate(_det(), {"no_parking_zone": True, "stationary_seconds": 600})
    assert PARKING_VIOLATION in _types(out)


def test_violations_summary_includes_repeat_offenders(db_session):
    now = datetime(2026, 1, 2, 9, 0, 0)
    repo = repository
    repo.add_violation(db_session, {
        "violation_type": "red_light",
        "plate_text": "MH-31-AB-1234",
        "camera_id": "cam_1",
        "camera_name": "Sitabuldi",
        "timestamp": now,
        "severity": "high",
        "confidence": 0.9,
    })
    repo.add_violation(db_session, {
        "violation_type": "red_light",
        "plate_text": "MH-31-AB-1234",
        "camera_id": "cam_1",
        "camera_name": "Sitabuldi",
        "timestamp": now + timedelta(minutes=20),
        "severity": "high",
        "confidence": 0.8,
    })
    db_session.commit()

    summary = repo.violations_summary(db_session, now - timedelta(hours=1), now + timedelta(hours=1))
    assert summary["top_10_repeat_offenders"][0]["plate"] == "MH-31-AB-1234"
    assert summary["top_10_repeat_offenders"][0]["violation_count"] == 2


def test_duplicate_violation_is_merged(db_session):
    repo = repository
    ts = datetime(2026, 1, 3, 10, 0, 0)
    repo.add_violation(db_session, {
        "violation_type": "over_speed",
        "plate_text": "MH-31-AB-1234",
        "camera_id": "cam_1",
        "camera_name": "Sitabuldi",
        "timestamp": ts,
        "severity": "medium",
        "confidence": 0.7,
    })
    repo.add_violation(db_session, {
        "violation_type": "over_speed",
        "plate_text": "MH-31-AB-1234",
        "camera_id": "cam_1",
        "camera_name": "Sitabuldi",
        "timestamp": ts + timedelta(minutes=3),
        "severity": "high",
        "confidence": 0.9,
    })
    db_session.commit()

    rows, total = repo.list_violations(db_session)
    assert total == 1
    assert rows[0].confidence == 0.9


def test_purge_old_data_removes_expired_rows(db_session):
    repo = repository
    old = datetime.utcnow() - timedelta(days=100)
    today = datetime.utcnow()
    repo.add_violation(db_session, {
        "violation_type": "red_light",
        "plate_text": "MH-31-AB-1234",
        "camera_id": "cam_1",
        "camera_name": "Sitabuldi",
        "timestamp": old,
        "severity": "low",
        "confidence": 0.6,
    })
    db_session.add(
        repository.Detection(
            camera_id="cam_1",
            timestamp=old,
            plate_text="MH-31-AB-1234",
        )
    )
    db_session.add(
        repository.Trajectory(
            plate_text="MH-31-AB-1234",
            date=(today.date() - timedelta(days=90)),
            vehicle_type="car",
        )
    )
    db_session.commit()

    result = repo.purge_old_data(db_session, now=today)
    assert result["violations_deleted"] >= 1
    assert result["detections_deleted"] >= 1
    assert result["trajectories_deleted"] >= 1
