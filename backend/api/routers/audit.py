from typing import Optional
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db.database import get_db
from db import models

router = APIRouter(prefix="/api/audit-logs", tags=["audit-logs"])


class AuditLogCreate(BaseModel):
    user: str = "operator_1"
    action: str
    resource: Optional[str] = None
    details: Optional[str] = None


@router.get("")
@router.get("/")
def list_audit_logs(
    user: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    limit: int = 100,
    db: Session = Depends(get_db)
):
    query = db.query(models.AuditLog)
    if user:
        query = query.filter(models.AuditLog.user == user)
    if action:
        query = query.filter(models.AuditLog.action.ilike(f"%{action}%"))
    logs = query.order_by(models.AuditLog.timestamp.desc()).limit(limit).all()
    return [l.to_dict() for l in logs]


@router.post("")
@router.post("/")

def create_audit_log(payload: AuditLogCreate, db: Session = Depends(get_db)):
    log_entry = models.AuditLog(
        user=payload.user,
        action=payload.action,
        resource=payload.resource,
        details=payload.details
    )
    db.add(log_entry)
    db.commit()
    db.refresh(log_entry)
    return log_entry.to_dict()
