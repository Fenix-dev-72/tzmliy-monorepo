from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class AttendancePush(BaseModel):
    user_id: UUID
    check_in_at: datetime | None = None


class AttendanceOut(BaseModel):
    id: UUID
    tenant_id: UUID
    user_id: UUID
    check_in_at: datetime
    check_out_at: datetime | None
    source: str
    created_at: datetime
