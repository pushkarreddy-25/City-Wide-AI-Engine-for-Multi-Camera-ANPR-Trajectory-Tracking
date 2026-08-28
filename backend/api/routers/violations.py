from typing import Literal, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Response
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from api.schemas import ViolationList, ViolationOut, ViolationsSummaryOut
from api.security import require_write_access
from db import repository
from db.database import get_db
from services import export_service, live_service, report_service

router = APIRouter(prefix="/api/violations", tags=["violations"])

#: Closed sets, so a typo returns 422 instead of silently matching nothing —
#: and so no unvalidated string reaches the query layer or the dashboard's
#: CSS class names.
ViolationType = Literal["red_light", "over_speed", "wrong_lane"]
Severity = Literal["low", "medium", "high"]

#: Deep pagination on SQLite means walking and discarding every preceding row,
#: so an unbounded offset is a free full-table scan per request.
MAX_OFFSET = 10_000


@router.get("/alerts", response_model=ViolationList, summary="Recent violation alerts")
def violation_alerts(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0, le=MAX_OFFSET),
    vtype: Optional[ViolationType] = Query(None, alias="type"),
    severity: Optional[Severity] = None,
    resolved: Optional[bool] = None,
    db: Session = Depends(get_db),
):
    # Unfiltered first page is served hot from the cache.
    if offset == 0 and not any([vtype, severity, resolved is not None]):
        cached = live_service.get_alerts(limit)
        if cached:
            return {"total": len(cached), "limit": limit, "offset": 0, "alerts": cached}
    rows, total = repository.list_violations(
        db, limit=limit, offset=offset, vtype=vtype, severity=severity, resolved=resolved)
    return {"total": total, "limit": limit, "offset": offset,
            "alerts": [r.to_dict() for r in rows]}


@router.get("/summary", response_model=ViolationsSummaryOut, summary="Violation summary")
def violation_summary(hours: int = Query(24, ge=1, le=720), db: Session = Depends(get_db)):
    return report_service.violations_summary(db, hours=hours)


@router.post("/{violation_id}/resolve", response_model=ViolationOut,
             summary="Mark a violation resolved",
             dependencies=[Depends(require_write_access)])
def resolve_violation(
    violation_id: str,
    # Bounded: SQLite does not enforce VARCHAR(500), so without max_length an
    # anonymous caller could POST a multi-megabyte note straight into the DB.
    notes: Optional[str] = Body(None, embed=True, max_length=500),
    db: Session = Depends(get_db),
):
    """The only endpoint that mutates data, hence the write guard above.

    Violation ids are sequential (``vio_1``, ``vio_2``, …), so this is trivially
    enumerable — set ``ANPR_API_KEY`` before exposing the API publicly.
    """
    try:
        numeric = int(violation_id.replace("vio_", ""))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid violation id")
    vio = repository.resolve_violation(db, numeric, notes)
    if vio is None:
        raise HTTPException(status_code=404, detail="Violation not found")
    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not save the resolution")
    return vio.to_dict()


@router.get("/export.csv", summary="Export violations as CSV")
def export_csv(hours: int = Query(24, ge=1, le=720), db: Session = Depends(get_db)):
    data = export_service.violations_csv(db, hours=hours)
    return Response(content=data, media_type="text/csv",
                    headers={"Content-Disposition": "attachment; filename=violations.csv"})


@router.get("/export.pdf", summary="Export violations report as PDF")
def export_pdf(hours: int = Query(24, ge=1, le=720), db: Session = Depends(get_db)):
    try:
        data = export_service.violations_pdf(db, hours=hours)
    except ImportError:
        raise HTTPException(status_code=503, detail="PDF export requires reportlab")
    return Response(content=data, media_type="application/pdf",
                    headers={"Content-Disposition": "attachment; filename=violations_report.pdf"})
