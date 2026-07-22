from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

CustomerStage = Literal["lead", "qualified", "customer", "lost"]
ActivityType = Literal["note", "call", "email", "meeting", "status_change"]
CustomerQuality = Literal["quality", "low_quality", "unrated"]


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
    # Nullable (2026-07-15): a CRM-synced lead that never left a phone
    # number still gets a row here (flagged low-quality), instead of being
    # dropped -- manual creation (CustomerCreate) still requires one.
    phone: str | None
    responsible_user_id: UUID | None
    stage: str
    # NULL = created manually in Tizimly; otherwise which integration this
    # lead was synced from (2026-07-15, seller/lead analytics).
    source: str | None
    quality: str
    lost_reason: str | None
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
