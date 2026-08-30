"""Live-state service backed by the cache abstraction.

Everything the dashboard needs in real time (latest vehicle sightings, the
violation alert feed, and the current congestion snapshot) is published here by
the simulator and read here by the API and WebSocket. Using the cache interface
keeps this identical whether the backend is in-memory (default) or Redis.

Values are expected to be JSON-serializable display dicts (timestamps already
ISO strings) so the in-memory and Redis backends behave the same.
"""
from typing import List, Optional

from cache import get_cache

KEY_VEHICLES = "live:vehicles"
KEY_ALERTS = "live:alerts"
KEY_CONGESTION = "live:congestion"
KEY_STATS = "live:stats"

MAX_VEHICLES = 200
MAX_ALERTS = 100


def _average_speed(vehicles: List[dict]) -> Optional[float]:
    speeds = [
        float(v["speed_kmh"])
        for v in vehicles
        if isinstance(v, dict) and isinstance(v.get("speed_kmh"), (int, float))
    ]
    if not speeds:
        return None
    return round(sum(speeds) / len(speeds), 1)


def publish_vehicle(vehicle: dict) -> None:
    get_cache().push(KEY_VEHICLES, vehicle, maxlen=MAX_VEHICLES)


def get_live_vehicles(limit: int = 50) -> List[dict]:
    return get_cache().range(KEY_VEHICLES, 0, limit - 1)


def publish_alert(alert: dict) -> None:
    get_cache().push(KEY_ALERTS, alert, maxlen=MAX_ALERTS)


def get_alerts(limit: int = 50) -> List[dict]:
    return get_cache().range(KEY_ALERTS, 0, limit - 1)


def set_congestion(snapshot: List[dict]) -> None:
    get_cache().set(KEY_CONGESTION, snapshot)


def get_congestion() -> List[dict]:
    return get_cache().get(KEY_CONGESTION) or []


def set_stats(stats: dict) -> None:
    payload = dict(stats or {})
    if payload.get("avg_city_speed") is None:
        payload["avg_city_speed"] = _average_speed(get_live_vehicles(200))
    get_cache().set(KEY_STATS, payload)


def get_stats(db=None) -> dict:
    stats = get_cache().get(KEY_STATS) or {}
    if not isinstance(stats, dict):
        stats = {}
    else:
        stats = dict(stats)
    if stats.get("avg_city_speed") is None:
        stats["avg_city_speed"] = _average_speed(get_live_vehicles(200))
    if stats.get("avg_city_speed") is None and db is not None:
        from db import repository
        stats["avg_city_speed"] = repository.average_city_speed(db)
    return stats

