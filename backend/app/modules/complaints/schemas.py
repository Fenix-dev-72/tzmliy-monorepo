from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

ComplaintStatus = ("open", "in_progress", "resolved")


class ComplaintCreate(BaseModel):
    subject: str = Field(min_length=3, max_length=200)
    message: str = Field(min_length=3, max_length=4000)


class ComplaintOut(BaseModel):
    id: UUID
    tenant_id: UUID
    created_by_user_id: UUID
    subject: str
    message: str
    status: str
    resolved_by_admin_id: UUID | None
    resolved_at: datetime | None
    created_at: datetime


class ComplaintStatusUpdate(BaseModel):
    status: str = Field(pattern="^(open|in_progress|resolved)$")
