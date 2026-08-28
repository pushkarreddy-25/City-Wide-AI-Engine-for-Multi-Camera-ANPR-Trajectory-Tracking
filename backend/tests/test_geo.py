"""Geospatial helper tests (utils.geo)."""
import pytest

from utils.geo import bearing_deg, cardinal, direction_between, haversine_m


def test_haversine_zero_distance():
    assert haversine_m(21.1458, 79.0882, 21.1458, 79.0882) == 0.0


def test_haversine_known_distance_one_degree_latitude():
    # One degree of latitude is ~111 km anywhere on Earth.
    d = haversine_m(21.0, 79.0, 22.0, 79.0)
    assert 110_000 < d < 112_000


def test_haversine_is_symmetric():
    a = haversine_m(21.1458, 79.0882, 21.1585, 79.0855)
    b = haversine_m(21.1585, 79.0855, 21.1458, 79.0882)
    assert a == pytest.approx(b)


def test_bearing_due_north():
    # Moving to a higher latitude at the same longitude points North (~0/360).
    b = bearing_deg(21.0, 79.0, 22.0, 79.0)
    assert min(b, 360 - b) == pytest.approx(0.0, abs=1.0)


def test_bearing_due_east():
    b = bearing_deg(0.0, 79.0, 0.0, 80.0)
    assert b == pytest.approx(90.0, abs=1.0)


def test_cardinal_labels_cover_the_compass():
    assert cardinal(0) == "North"
    assert cardinal(90) == "East"
    assert cardinal(180) == "South"
    assert cardinal(270) == "West"
    # Boundaries round to the nearest 45-degree sector.
    assert cardinal(44) == "North-East"
    assert cardinal(359) == "North"


def test_direction_between_matches_cardinal_of_bearing():
    assert direction_between(21.0, 79.0, 22.0, 79.0) == "North"
    assert direction_between(0.0, 79.0, 0.0, 80.0) == "East"
