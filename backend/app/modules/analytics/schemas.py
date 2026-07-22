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


class RevenueBucketOut(BaseModel):
    bucket_start: datetime
    currency: str
    sales_amount: int
    collected_amount: int


class DebtSummaryOut(BaseModel):
    currency: str
    total_outstanding: int
    overdue_amount: int
    overdue_count: int


class LeadQualitySummaryOut(BaseModel):
    """Tenant-wide lead funnel/quality summary (2026-07-15) -- shown to the
    admin, not scoped to one seller. See customers.quality's own docstring
    for what "quality"/"low_quality" mean."""

    period_start: datetime
    period_end: datetime
    received_count: int
    active_count: int
    won_count: int
    lost_count: int
    quality_count: int
    low_quality_count: int
    conversion_pct: float | None


class SellerSalesByModeOut(BaseModel):
    mode: str | None  # None = "Aniqlanmagan" (sale predates the delivery_mode column)
    currency: str
    sales_count: int
    agreed_amount: int
    collected_amount: int


class SellerKpisOut(BaseModel):
    period_start: datetime
    period_end: datetime
    leads_count: int
    sales_count: int
    conversion_pct: float | None
    sales_total_uzs: int
    sales_total_usd: int
    debt_collection_pct: float | None
    refund_pct: float | None
    # None when the seller hasn't linked their CRM identity yet (see
    # crm_manager_mappings) or the live provider call failed -- rendered as a
    # placeholder ("CRM ulanmagan"), not an error, by the frontend.
    followup_pct: float | None
    followup_total: int | None
    followup_linked: bool
    # Expanded 2026-07-15 for the full seller KPI dashboard (sales-by-mode,
    # call activity, CRM activity, lead funnel, response time) -- all
    # computed server-side, fanned out in parallel by service.py.
    sales_by_mode: list[SellerSalesByModeOut]
    calls_total: int
    calls_outbound: int
    calls_inbound: int
    calls_missed_pct: float | None
    calls_avg_duration_seconds: int | None
    calls_daily_talk_seconds: int | None
    crm_notes_count: int
    crm_stage_changes_count: int
    leads_active_count: int
    leads_won_count: int
    leads_lost_count: int
    # 2026-07-15 (seller/lead analytics): only ever set once a lead reaches a
    # terminal CRM outcome -- see customers.quality's own docstring.
    leads_quality_count: int
    leads_low_quality_count: int
    # None below a minimum sample size (see service.py) rather than a
    # misleading median computed from 1-2 data points.
    lead_response_median_seconds: int | None
