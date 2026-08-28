"""Analytics/report service — shapes repository output for the API.

Live congestion prefers the cache snapshot (published every tick by the
simulator) and falls back to a DB query if the cache is cold.
"""
from datetime import date as date_cls
from datetime import datetime, timedelta
from typing import Optional

from db import repository
from services import live_service


def daily_volume(db, on_date: Optional[date_cls] = None) -> dict:
    return repository.daily_volume(db, on_date or datetime.utcnow().date())


def violations_summary(db, start: Optional[datetime] = None, end: Optional[datetime] = None,
                       hours: int = 24) -> dict:
    end = end or datetime.utcnow()
    start = start or (end - timedelta(hours=hours))
    return repository.violations_summary(db, start, end)


def congestion(db, window_minutes: int = 10) -> list:
    cached = live_service.get_congestion()
    if cached:
        return cached
    return repository.congestion_snapshot(db, window_minutes)


def vehicle_search(db, **filters) -> dict:
    limit = filters.pop("limit", 100)
    offset = filters.pop("offset", 0)
    rows, total = repository.search_detections(db, limit=limit, offset=offset, **filters)
    return {"total": total, "limit": limit, "offset": offset,
            "results": [r.to_dict() for r in rows]}
