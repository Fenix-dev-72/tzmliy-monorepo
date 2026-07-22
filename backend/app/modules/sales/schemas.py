from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

Currency = Literal["UZS", "USD"]
SaleStatus = Literal["active", "completed", "cancelled"]
DeliveryMode = Literal["online", "offline", "intensive"]


class SaleCreate(BaseModel):
    customer_id: UUID
    catalog_category_id: UUID | None = None
    responsible_user_id: UUID
    currency: Currency
    price_amount: int = Field(ge=0)
    deadline: datetime
    delivery_mode: DeliveryMode | None = None
    # When set, catalog_category_id is derived from the product's own
    # category (overriding whatever was passed above) and this sale
    # atomically decrements the product's stock_quantity by `quantity`.
    product_id: UUID | None = None
    quantity: int = Field(default=1, ge=1)


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
    delivery_mode: str | None
    status: str
    version: int
    idempotency_key: str
    product_id: UUID | None
    quantity: int
    # NULL = created manually in Tizimly; otherwise which CRM integration
    # auto-created this sale from a deal ("сделка") -- lets the frontend show
    # a visible badge distinguishing CRM-sourced sales (2026-07-15).
    source: str | None
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
