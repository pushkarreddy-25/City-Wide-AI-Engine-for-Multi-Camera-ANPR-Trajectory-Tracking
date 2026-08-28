from typing import Optional

from pydantic import BaseModel


class Position(BaseModel):
    lat: Optional[float] = None
    lng: Optional[float] = None


class BBox(BaseModel):
    x1: Optional[float] = None
    y1: Optional[float] = None
    x2: Optional[float] = None
    y2: Optional[float] = None


class Pagination(BaseModel):
    total: int = 0
    limit: int = 0
    offset: int = 0
