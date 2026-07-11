from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class DashboardCreate(BaseModel):
    name: str = Field(min_length=1)
    password: str = Field(min_length=8, max_length=72)


class DashboardOut(BaseModel):
    id: UUID
    tenant_id: UUID
    name: str
    created_at: datetime


class DashboardLoginRequest(BaseModel):
    tenant_slug: str
    name: str
    password: str


class DashboardTokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LeaderboardEntryOut(BaseModel):
    user_id: UUID
    user_email: str
    currency: str
    sales_count: int
    total_amount: int


class CategorySalesEntryOut(BaseModel):
    category_id: UUID | None
    category_name: str | None
    currency: str
    sales_count: int
    total_amount: int


class CurrencyTotalOut(BaseModel):
    currency: str
    total_amount: int


class DashboardSummaryOut(BaseModel):
    period_start: datetime
    period_end: datetime
    total_sales_count: int
    sales_by_currency: list[CurrencyTotalOut]
    collected_by_currency: list[CurrencyTotalOut]
    active_customers_count: int
    top_sellers: list[LeaderboardEntryOut]
