"""Rule-based violation-detection tests (violations.detector)."""
from datetime import datetime

from violations.detector import (
    OVER_SPEED, RED_LIGHT, WRONG_LANE, ViolationDetector,
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
