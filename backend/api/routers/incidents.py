from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db.database import get_db
from db import models

router = APIRouter(prefix="/api/incidents", tags=["incidents"])


class IncidentCreate(BaseModel):
    title: str
    description: Optional[str] = None
    severity: str = "Medium"
    camera_id: Optional[str] = None
    camera_name: Optional[str] = None
    assigned_unit: Optional[str] = None


class IncidentUpdate(BaseModel):
    status: Optional[str] = None
    assigned_unit: Optional[str] = None
    description: Optional[str] = None


@router.get("", response_model=List[dict])
@router.get("/")
def list_incidents(
    status: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    limit: int = 50,
    db: Session = Depends(get_db)
):
    query = db.query(models.Incident)
    if status:
        query = query.filter(models.Incident.status == status)
    if severity:
        query = query.filter(models.Incident.severity == severity)
    incidents = query.order_by(models.Incident.created_at.desc()).limit(limit).all()
    return [i.to_dict() for i in incidents]


@router.post("")
@router.post("/")

def create_incident(payload: IncidentCreate, db: Session = Depends(get_db)):
    incident = models.Incident(
        title=payload.title,
        description=payload.description,
        severity=payload.severity,
        camera_id=payload.camera_id,
        camera_name=payload.camera_name,
        assigned_unit=payload.assigned_unit,
        status="Open"
    )
    db.add(incident)
    db.commit()
    db.refresh(incident)
    return incident.to_dict()


@router.patch("/{incident_id}")
@router.post("/{incident_id}")
def update_incident(incident_id: str, payload: IncidentUpdate, db: Session = Depends(get_db)):

    # Parse integer ID from "inc_1" or "1"
    raw_id = incident_id.replace("inc_", "")
    try:
        numeric_id = int(raw_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid incident ID format")

    incident = db.query(models.Incident).filter(models.Incident.id == numeric_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    if payload.status:
        incident.status = payload.status
    if payload.assigned_unit:
        incident.assigned_unit = payload.assigned_unit
    if payload.description:
        incident.description = payload.description

    db.commit()
    db.refresh(incident)
    return incident.to_dict()
