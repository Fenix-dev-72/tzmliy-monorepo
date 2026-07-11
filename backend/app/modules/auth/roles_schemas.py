from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class RoleCreate(BaseModel):
    name: str
    permissions: list[str]


class RolePermissionsUpdate(BaseModel):
    permissions: list[str]


class RoleOut(BaseModel):
    id: UUID
    tenant_id: UUID
    name: str
    is_system: bool
    permissions: list[str]
    created_at: datetime
