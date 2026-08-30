from datetime import date as date_type
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from api.schemas import (
    CongestionCell, DailyVolumeOut, LiveStatsOut, SpeedSummaryOut, ViolationsSummaryOut,
)
from api.security import require_write_access
from db import repository
from db.database import get_db
from services import export_service, live_service, report_service

router = APIRouter(prefix="/api", tags=["analytics"])


@router.get("/congestion/heatmap", response_model=List[CongestionCell],
            summary="Per-camera congestion snapshot")
def congestion_heatmap(window_minutes: int = Query(10, ge=1, le=120),
                       db: Session = Depends(get_db)):
    return report_service.congestion(db, window_minutes)


@router.get("/reports/daily-volume", response_model=DailyVolumeOut,
            summary="Traffic volume for a day, by hour and camera")
def daily_volume(on_date: Optional[date_type] = Query(None, alias="date"),
                 db: Session = Depends(get_db)):
    return report_service.daily_volume(db, on_date)


@router.get("/reports/violations-summary", response_model=ViolationsSummaryOut,
            summary="Violation summary over a window")
def violations_summary(hours: int = Query(24, ge=1, le=720), db: Session = Depends(get_db)):
    return report_service.violations_summary(db, hours=hours)


@router.get("/reports/speed-summary", response_model=SpeedSummaryOut,
            summary="Live and recent city-wide speed statistics")
def speed_summary(window_minutes: int = Query(15, ge=1, le=120),
                  db: Session = Depends(get_db)):
    return report_service.speed_summary(db, window_minutes)


@router.get("/reports/daily-volume.csv", summary="Export daily volume as CSV")
def daily_volume_csv(on_date: Optional[date_type] = Query(None, alias="date"),
                     db: Session = Depends(get_db)):
    data = export_service.daily_volume_csv(db, on_date)
    return Response(content=data, media_type="text/csv",
                    headers={"Content-Disposition": "attachment; filename=daily_volume.csv"})


@router.post("/admin/purge-old-data", summary="Purge expired detection, trajectory, and violation records")
def purge_old_data(
    db: Session = Depends(get_db),
    _: None = Depends(require_write_access),
):
    try:
        result = repository.purge_old_data(db)
        db.commit()
        return result
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not purge old data")


@router.get("/stats", response_model=LiveStatsOut, summary="Live engine statistics")
def stats(db: Session = Depends(get_db)):
    return live_service.get_stats(db=db)

