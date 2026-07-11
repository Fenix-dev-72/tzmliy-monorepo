from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    role_id: UUID
    phone: str | None = None


class UserOut(BaseModel):
    id: UUID
    tenant_id: UUID
    email: str | None
    phone: str | None
    role_id: UUID
    role_name: str
    is_active: bool
    created_at: datetime


class UserRoleUpdate(BaseModel):
    role_id: UUID
