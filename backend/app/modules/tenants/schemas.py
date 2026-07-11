from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class PlatformAdminLoginRequest(BaseModel):
    email: EmailStr
    password: str


class PlatformLoginResponse(BaseModel):
    requires_2fa: bool = False
    pending_token: str | None = None
    access_token: str | None = None
    refresh_token: str | None = None
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TenantCreate(BaseModel):
    name: str
    slug: str


class TenantOut(BaseModel):
    id: UUID
    name: str
    slug: str
    status: str
    trial_ends_at: datetime | None
    created_at: datetime


class TenantAdminUserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    reason: str = Field(min_length=3)


class AuditLogOut(BaseModel):
    id: UUID
    actor_type: str
    actor_id: UUID
    tenant_id: UUID | None
    action: str
    reason: str
    created_at: datetime
