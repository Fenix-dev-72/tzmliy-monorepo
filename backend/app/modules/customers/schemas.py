from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

CustomerStage = Literal["lead", "qualified", "customer", "lost"]
ActivityType = Literal["note", "call", "email", "meeting", "status_change"]


class CustomerCreate(BaseModel):
    full_name: str
    phone: str
    responsible_user_id: UUID | None = None
    stage: CustomerStage = "lead"


class CustomerUpdate(BaseModel):
    full_name: str
    phone: str
    responsible_user_id: UUID | None = None
    stage: CustomerStage


class CustomerOut(BaseModel):
    id: UUID
    tenant_id: UUID
    full_name: str
    phone: str
    responsible_user_id: UUID | None
    stage: str
    created_at: datetime
    updated_at: datetime


class CustomerActivityCreate(BaseModel):
    activity_type: ActivityType
    note: str | None = None


class CustomerActivityOut(BaseModel):
    id: UUID
    tenant_id: UUID
    customer_id: UUID
    actor_user_id: UUID
    activity_type: str
    note: str | None
    created_at: datetime
