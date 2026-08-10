from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

NotificationType = Literal["support_reply", "broadcast", "payment_due"]


class NotificationOut(BaseModel):
    id: UUID
    tenant_id: UUID
    user_id: UUID
    type: NotificationType
    title: str
    body: str
    link: str | None
    is_read: bool
    created_at: datetime


class UnreadCountOut(BaseModel):
    count: int


class BroadcastRequest(BaseModel):
    audience: Literal["all", "plan"]
    billing_plan_id: UUID | None = None
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=4000)
    reason: str = Field(min_length=1, max_length=500)


class BroadcastOut(BaseModel):
    tenants_reached: int
    admins_notified: int
