from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

Currency = Literal["UZS", "USD"]


class ProductCreate(BaseModel):
    name: str
    category_id: UUID
    cost_price_amount: int = Field(ge=0)
    cost_price_currency: Currency
    sell_price_amount: int = Field(ge=0)
    sell_price_currency: Currency
    stock_quantity: int = Field(default=0, ge=0)


class ProductUpdate(BaseModel):
    name: str
    category_id: UUID
    cost_price_amount: int = Field(ge=0)
    cost_price_currency: Currency
    sell_price_amount: int = Field(ge=0)
    sell_price_currency: Currency


class StockAdjust(BaseModel):
    # Positive = restock, negative = manual correction (e.g. damaged goods) --
    # separate from the automatic decrement sales/service.py does on every
    # sale against this product.
    delta: int


class ProductOut(BaseModel):
    id: UUID
    tenant_id: UUID
    category_id: UUID
    name: str
    cost_price_amount: int
    cost_price_currency: str
    sell_price_amount: int
    sell_price_currency: str
    stock_quantity: int
    photo_object_key: str | None
    created_at: datetime
    updated_at: datetime


class ProductPhotoUrlOut(BaseModel):
    photo_url: str
