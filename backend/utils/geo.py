"""Geospatial helpers: distance and compass direction between coordinates."""
import math

EARTH_RADIUS_M = 6371000.0


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance between two lat/lng points, in meters."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def bearing_deg(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Initial compass bearing (degrees, 0=North) from point 1 to point 2."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dlambda = math.radians(lng2 - lng1)
    x = math.sin(dlambda) * math.cos(phi2)
    y = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(dlambda)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


_CARDINALS = ["North", "North-East", "East", "South-East",
              "South", "South-West", "West", "North-West"]


def cardinal(bearing: float) -> str:
    """Convert a bearing in degrees to an 8-point compass label."""
    idx = int((bearing + 22.5) % 360 // 45)
    return _CARDINALS[idx]


def direction_between(lat1: float, lng1: float, lat2: float, lng2: float) -> str:
    """Compass direction of travel from point 1 to point 2."""
    return cardinal(bearing_deg(lat1, lng1, lat2, lng2))
