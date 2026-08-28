"""Cross-camera trajectory-linking tests (linking_module.trajectory_linker).

This is the system's core intelligence: stitching sightings from different
cameras into one journey, tolerating a single-character OCR misread, and
rejecting physically impossible links. Coordinates come from the two-camera
`sample_cameras` fixture (~555 m apart).
"""
from datetime import datetime, timedelta

import pytest

from linking_module.trajectory_linker import TrajectoryLinker

T0 = datetime(2026, 1, 1, 12, 0, 0)

CAM_POS = {
    "cam_1": {"lat": 21.1450, "lng": 79.0880},
    "cam_2": {"lat": 21.1500, "lng": 79.0880},
}


def sighting(camera_id, secs, plate, conf, vtype="Car", color="White"):
    """Build a pre-reduced sighting (used with link(reduce=False))."""
    return {
        "camera_id": camera_id,
        "camera_name": camera_id,
        "timestamp": T0 + timedelta(seconds=secs),
        "plate": plate,
        "plate_confidence": conf,
        "type": vtype,
        "color": color,
        "position": CAM_POS[camera_id],
    }


@pytest.fixture()
def linker(sample_cameras):
    return TrajectoryLinker(sample_cameras)


def test_exact_plate_links_across_two_cameras(linker):
    sightings = [
        sighting("cam_1", 0, "MH-31-AB-1234", 0.92),
        sighting("cam_2", 120, "MH-31-AB-1234", 0.90),
    ]
    trajs = linker.link(sightings, reduce=False)
    assert len(trajs) == 1
    assert len(trajs[0]["sightings"]) == 2
    assert trajs[0]["plate"] == "MH-31-AB-1234"


def test_single_char_ocr_error_is_self_corrected(linker):
    """A confident read plus a 1-edit misread should link into ONE journey,
    and the canonical plate should be the confident one (weighted vote)."""
    sightings = [
        sighting("cam_1", 0, "MH-31-AB-1234", 0.95),      # confident
        sighting("cam_2", 120, "MH-31-AB-1284", 0.55),    # 3->8 misread, low conf
    ]
    trajs = linker.link(sightings, reduce=False)
    assert len(trajs) == 1, "near-plate + matching attributes should link"
    assert trajs[0]["plate"] == "MH-31-AB-1234", "confidence-weighted vote self-corrects OCR"


def test_physically_impossible_link_is_rejected(linker):
    """Same plate at two cameras 555 m apart but only 2 s apart implies ~1000
    km/h — the speed gate must refuse to link them."""
    sightings = [
        sighting("cam_1", 0, "MH-31-AB-1234", 0.95),
        sighting("cam_2", 2, "MH-31-AB-1234", 0.95),
    ]
    trajs = linker.link(sightings, reduce=False)
    assert len(trajs) == 2


def test_two_distinct_plates_do_not_merge(linker):
    sightings = [
        sighting("cam_1", 0, "MH-31-AB-1234", 0.93),
        sighting("cam_1", 3, "MH-31-XY-9999", 0.93),      # >1 edit, same camera
    ]
    trajs = linker.link(sightings, reduce=False)
    assert len(trajs) == 2


def test_time_gap_beyond_limit_is_not_linked(sample_cameras):
    linker = TrajectoryLinker(sample_cameras, max_time_gap_s=600)
    sightings = [
        sighting("cam_1", 0, "MH-31-AB-1234", 0.95),
        sighting("cam_2", 5000, "MH-31-AB-1234", 0.95),   # ~83 min later
    ]
    trajs = linker.link(sightings, reduce=False)
    assert len(trajs) == 2


def test_attribute_only_link_across_cameras_for_unreadable_plate(linker):
    """When neither plate is confident, matching type+colour across two cameras
    (feasible in time/space) is still enough to associate the sightings."""
    sightings = [
        sighting("cam_1", 0, None, 0.0, vtype="Truck", color="Red"),
        sighting("cam_2", 120, None, 0.0, vtype="Truck", color="Red"),
    ]
    trajs = linker.link(sightings, reduce=False)
    assert len(trajs) == 1
    assert len(trajs[0]["sightings"]) == 2


def test_reduce_collapses_multiframe_track_to_one_sighting(linker):
    """Several frames of one (camera, track) collapse to a single sighting that
    keeps the highest plate confidence observed."""
    dets = [
        {"camera_id": "cam_1", "track_id": "cam_1_track_1", "timestamp": T0,
         "plate": "MH-31-AB-1234", "plate_confidence": 0.55, "type": "Car", "color": "White"},
        {"camera_id": "cam_1", "track_id": "cam_1_track_1", "timestamp": T0 + timedelta(seconds=1),
         "plate": "MH-31-AB-1234", "plate_confidence": 0.88, "type": "Car", "color": "White"},
        {"camera_id": "cam_1", "track_id": "cam_1_track_1", "timestamp": T0 + timedelta(seconds=2),
         "plate": "MH-31-AB-1234", "plate_confidence": 0.71, "type": "Car", "color": "White"},
    ]
    sightings = linker.reduce_to_sightings(dets)
    assert len(sightings) == 1
    assert sightings[0]["plate_confidence"] == 0.88


def test_finalized_trajectory_has_expected_shape(linker):
    trajs = linker.link([
        sighting("cam_1", 0, "MH-31-AB-1234", 0.9),
        sighting("cam_2", 120, "MH-31-AB-1234", 0.9),
    ], reduce=False)
    t = trajs[0]
    assert set(t) >= {"plate", "date", "vehicle_type", "vehicle_color", "sightings"}
    assert t["date"] == T0.date()
    # first sighting carries a computed compass direction toward the next camera
    assert t["sightings"][0]["direction"] == "North"
