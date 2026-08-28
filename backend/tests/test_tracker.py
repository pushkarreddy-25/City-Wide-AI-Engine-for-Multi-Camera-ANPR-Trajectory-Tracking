"""Single-camera tracker tests (tracking_module.tracker)."""
from datetime import datetime, timedelta

from tracking_module.tracker import SimpleTracker, TrackerManager, iou

T0 = datetime(2026, 1, 1, 12, 0, 0)


def _det(bbox, plate=None, conf=0.0):
    return {"bbox": bbox, "plate": plate, "plate_confidence": conf}


# -- iou geometry ------------------------------------------------------------
def test_iou_identical_boxes_is_one():
    assert iou((0, 0, 10, 10), (0, 0, 10, 10)) == 1.0


def test_iou_disjoint_boxes_is_zero():
    assert iou((0, 0, 10, 10), (100, 100, 110, 110)) == 0.0


def test_iou_half_overlap():
    # (0,0,10,10) vs (5,5,15,15): inter 25, union 175 -> 1/7.
    assert abs(iou((0, 0, 10, 10), (5, 5, 15, 15)) - 25 / 175) < 1e-9


# -- track association -------------------------------------------------------
def test_same_vehicle_across_frames_keeps_one_track():
    tr = SimpleTracker("cam_1")
    d1 = _det((100, 100, 180, 180))
    tr.update([d1], timestamp=T0)
    d2 = _det((104, 103, 184, 182))            # nudged a few px -> high IoU
    tr.update([d2], timestamp=T0 + timedelta(seconds=1))
    assert d1["track_id"] == d2["track_id"]
    assert d1["track_id"] == "cam_1_track_1"


def test_two_vehicles_same_frame_get_distinct_tracks():
    tr = SimpleTracker("cam_1")
    a = _det((0, 0, 60, 60))
    b = _det((600, 400, 680, 480))
    tr.update([a, b], timestamp=T0)
    assert a["track_id"] != b["track_id"]


def test_time_gap_retires_track_so_new_vehicle_is_not_merged():
    """Two vehicles occupying the same pixels far apart in time must not merge.

    This is the wall-clock ageing guarantee: a stale track is retired before
    matching, so the later detection starts a fresh id.
    """
    tr = SimpleTracker("cam_1", max_gap_seconds=6.0)
    first = _det((100, 100, 180, 180))
    tr.update([first], timestamp=T0)
    later = _det((100, 100, 180, 180))          # same spot, 10s later (> gap)
    tr.update([later], timestamp=T0 + timedelta(seconds=10))
    assert first["track_id"] != later["track_id"]


def test_within_gap_same_spot_stays_one_track():
    tr = SimpleTracker("cam_1", max_gap_seconds=6.0)
    first = _det((100, 100, 180, 180))
    tr.update([first], timestamp=T0)
    soon = _det((101, 100, 181, 180))
    tr.update([soon], timestamp=T0 + timedelta(seconds=2))   # within the gap
    assert first["track_id"] == soon["track_id"]


def test_tracker_keeps_highest_confidence_plate_per_track():
    tr = SimpleTracker("cam_1")
    tr.update([_det((100, 100, 180, 180), plate="MH-31-AB-1234", conf=0.6)], timestamp=T0)
    tr.update([_det((102, 101, 182, 181), plate="MH-31-AB-9999", conf=0.9)],
              timestamp=T0 + timedelta(seconds=1))
    # internal state keeps the more confident read for the track
    track = next(iter(tr._tracks.values()))
    assert track["plate"] == "MH-31-AB-9999"
    assert track["plate_conf"] == 0.9


def test_manager_routes_per_camera():
    mgr = TrackerManager()
    a = _det((0, 0, 50, 50))
    b = _det((0, 0, 50, 50))
    mgr.update("cam_1", [a], timestamp=T0)
    mgr.update("cam_2", [b], timestamp=T0)
    assert a["track_id"].startswith("cam_1_track_")
    assert b["track_id"].startswith("cam_2_track_")
