from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

Currency = Literal["UZS", "USD"]
SaleStatus = Literal["active", "completed", "cancelled"]


class SaleCreate(BaseModel):
    customer_id: UUID
    catalog_category_id: UUID | None = None
    responsible_user_id: UUID
    currency: Currency
    price_amount: int = Field(ge=0)
    deadline: datetime


class SaleUpdate(BaseModel):
    catalog_category_id: UUID | None = None
    responsible_user_id: UUID
    price_amount: int = Field(ge=0)
    deadline: datetime
    status: SaleStatus
    version: int
    reason: str | None = None


class SaleOut(BaseModel):
    id: UUID
    tenant_id: UUID
    customer_id: UUID
    catalog_category_id: UUID | None
    responsible_user_id: UUID
    currency: str
    price_amount: int
    deadline: datetime
    status: str
    version: int
    idempotency_key: str
    created_at: datetime
    updated_at: datetime


class SaleChangeOut(BaseModel):
    id: UUID
    tenant_id: UUID
    sale_id: UUID
    actor_user_id: UUID
    changed_fields: dict[str, Any]
    reason: str | None
    created_at: datetime
