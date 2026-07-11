from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class CategoryCreate(BaseModel):
    name: str
    parent_id: UUID | None = None


class CategoryUpdate(BaseModel):
    name: str


class CategoryOut(BaseModel):
    id: UUID
    tenant_id: UUID
    parent_id: UUID | None
    name: str
    created_at: datetime


class CategoryNode(BaseModel):
    id: UUID
    tenant_id: UUID
    parent_id: UUID | None
    name: str
    created_at: datetime
    children: list[CategoryNode] = Field(default_factory=list)


CategoryNode.model_rebuild()
