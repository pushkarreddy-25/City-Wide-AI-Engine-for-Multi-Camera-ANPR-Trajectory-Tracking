"""Tests for journey search, fallback to detections, and plate normalisation."""
from datetime import datetime, date

from db import repository
from services import report_service


def test_journey_fallback_to_detections(db_session, sample_cameras):
    """When no Trajectory exists, journey_search falls back to raw detections."""
    # Seed two detections for a plate that has never been linked into a trajectory
    repository.add_detection(db_session, {
        "camera_id": "cam_1",
        "track_id": "trk_fallback",
        "timestamp": datetime(2026, 8, 30, 10, 0, 0),
        "plate": "MH-31-FB-9999",
        "plate_confidence": 0.92,
        "vehicle_type": "Car",
        "vehicle_color": "White",
        "speed_kmh": 45.0,
    })
    repository.add_detection(db_session, {
        "camera_id": "cam_2",
        "track_id": "trk_fallback",
        "timestamp": datetime(2026, 8, 30, 10, 5, 0),
        "plate": "MH-31-FB-9999",
        "plate_confidence": 0.89,
        "vehicle_type": "Car",
        "vehicle_color": "White",
        "speed_kmh": 38.0,
    })
    db_session.commit()

    # The journey endpoint should synthesise a journey from detections
    result = report_service.journey_search(db_session, "MH-31-FB-9999")
    assert result is not None
    assert result["is_approximate"] is True
    assert result["plate"] == "MH-31-FB-9999"
    assert len(result["sightings"]) == 2
    assert result["sightings"][0]["camera_id"] == "cam_1"
    assert result["sightings"][1]["camera_id"] == "cam_2"


def test_plate_normalisation_matches_stored_format(db_session):
    """Plates stored as MH-31-AB-1234 match input 'mh31ab1234' or 'mh 31 ab 1234'."""
    repository.add_detection(db_session, {
        "camera_id": "cam_1",
        "track_id": "trk_norm",
        "timestamp": datetime(2026, 8, 30, 12, 0, 0),
        "plate": "MH-31-AB-1234",
        "plate_confidence": 0.95,
        "vehicle_type": "Car",
        "speed_kmh": 50.0,
    })
    db_session.commit()

    # All these input variants should match the stored hyphenated plate
    for variant in ["mh31ab1234", "MH31AB1234", "mh 31 ab 1234", "MH-31-AB-1234"]:
        result = report_service.journey_search(db_session, variant)
        assert result is not None, f"Failed to match input '{variant}'"
        assert result["plate"] == "MH-31-AB-1234"


def test_partial_plate_search_returns_multiple(db_session):
    """Searching 'MH-31' should return every plate starting with those groups."""
    repository.add_trajectory(db_session, {
        "plate": "MH-31-AB-1111",
        "date": date(2026, 8, 29),
        "sightings": [{"camera_id": "cam_1", "timestamp": datetime(2026, 8, 29, 9, 0)}],
    })
    repository.add_trajectory(db_session, {
        "plate": "MH-31-CD-2222",
        "date": date(2026, 8, 29),
        "sightings": [{"camera_id": "cam_1", "timestamp": datetime(2026, 8, 29, 10, 0)}],
    })
    repository.add_trajectory(db_session, {
        "plate": "KA-01-AB-3333",
        "date": date(2026, 8, 29),
        "sightings": [{"camera_id": "cam_1", "timestamp": datetime(2026, 8, 29, 11, 0)}],
    })
    db_session.commit()

    results = report_service.search_journeys(db_session, "MH-31", limit=10)
    plates = [r["plate"] for r in results]
    assert "MH-31-AB-1111" in plates
    assert "MH-31-CD-2222" in plates
    assert "KA-01-AB-3333" not in plates


def test_violations_scoped_to_journey_date(db_session):
    """Violations outside the journey date range are excluded."""
    repository.add_detection(db_session, {
        "camera_id": "cam_1",
        "track_id": "trk_vio",
        "timestamp": datetime(2026, 8, 30, 14, 0, 0),
        "plate": "MH-31-VT-8888",
        "vehicle_type": "Car",
        "speed_kmh": 75.0,
    })
    db_session.commit()

    # Add two violations: one on the journey date, one a week earlier
    repository.add_violation(db_session, {
        "violation_type": "over_speed",
        "plate_text": "MH-31-VT-8888",
        "camera_id": "cam_1",
        "timestamp": datetime(2026, 8, 30, 14, 0, 0),
        "severity": "high",
    })
    repository.add_violation(db_session, {
        "violation_type": "red_light",
        "plate_text": "MH-31-VT-8888",
        "camera_id": "cam_1",
        "timestamp": datetime(2026, 8, 23, 9, 0, 0),
        "severity": "medium",
    })
    db_session.commit()

    result = report_service.journey_search(
        db_session, "MH-31-VT-8888",
        date_from=date(2026, 8, 30), date_to=date(2026, 8, 30),
    )
    assert result is not None
    vio_types = [v["type"] for v in result["violations"]]
    assert "over_speed" in vio_types
    assert "red_light" not in vio_types
