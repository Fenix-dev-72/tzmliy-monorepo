from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

ProviderName = Literal["utel", "moi_zvonki"]


class IntegrationCredentialCreate(BaseModel):
    provider: ProviderName
    webhook_secret: str
    api_key: str | None = None


class IntegrationCredentialOut(BaseModel):
    id: UUID
    tenant_id: UUID
    provider: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class ManagerMappingCreate(BaseModel):
    provider: ProviderName
    external_agent_id: str
    user_id: UUID


class ManagerMappingOut(BaseModel):
    id: UUID
    tenant_id: UUID
    provider: str
    external_agent_id: str
    user_id: UUID
    is_active: bool
    created_at: datetime


class CallOut(BaseModel):
    id: UUID
    tenant_id: UUID
    provider: str
    external_call_id: str
    direction: str
    from_number: str
    to_number: str
    responsible_user_id: UUID | None
    duration_seconds: int
    recording_object_key: str | None
    status: str
    started_at: datetime
    ended_at: datetime | None
    created_at: datetime


class RecordingUrlOut(BaseModel):
    url: str
