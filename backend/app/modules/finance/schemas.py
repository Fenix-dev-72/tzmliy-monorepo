from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

Currency = Literal["UZS", "USD"]
PaymentMethod = Literal["cash", "card", "click", "payme", "manual"]
AdjustmentType = Literal["refund", "tariff_change"]
BonusType = Literal["percent", "fixed_per_sale"]


class PaymentCreate(BaseModel):
    sale_id: UUID
    amount: int = Field(gt=0)
    currency: Currency
    method: PaymentMethod


class PaymentOut(BaseModel):
    id: UUID
    tenant_id: UUID
    sale_id: UUID
    amount: int
    currency: str
    method: str
    idempotency_key: str
    recorded_by_user_id: UUID
    reversed_at: datetime | None
    created_at: datetime


class LedgerEntryOut(BaseModel):
    id: UUID
    tenant_id: UUID
    sale_id: UUID | None
    customer_id: UUID | None
    entry_type: str
    amount: int
    currency: str
    related_payment_id: UUID | None
    related_refund_id: UUID | None
    description: str | None
    created_by_user_id: UUID
    created_at: datetime


class SaleLedgerOut(BaseModel):
    entries: list[LedgerEntryOut]
    balance: int


class CustomerOutstandingSaleOut(BaseModel):
    sale_id: UUID
    catalog_category_id: UUID | None
    category_name: str | None
    price_amount: int
    currency: str
    deadline: datetime
    status: str
    balance: int


class ProfitSummaryEntryOut(BaseModel):
    currency: str
    revenue: int
    cost: int
    profit: int


class AdjustmentRequestCreate(BaseModel):
    sale_id: UUID
    type: AdjustmentType
    payload: dict[str, Any]


class AdjustmentReviewRequest(BaseModel):
    version: int
    review_reason: str | None = None


class AdjustmentRequestOut(BaseModel):
    id: UUID
    tenant_id: UUID
    sale_id: UUID
    requested_by_user_id: UUID
    type: str
    payload: dict[str, Any]
    status: str
    reviewed_by_user_id: UUID | None
    review_reason: str | None
    version: int
    idempotency_key: str
    review_idempotency_key: str | None
    created_at: datetime
    reviewed_at: datetime | None


class RefundOut(BaseModel):
    id: UUID
    tenant_id: UUID
    sale_id: UUID
    adjustment_request_id: UUID
    amount: int
    currency: str
    created_by_user_id: UUID
    created_at: datetime


class BonusPlanCreate(BaseModel):
    name: str
    applies_to_role_id: UUID
    bonus_type: BonusType = "percent"
    # percent: commission_bps required (basis points, e.g. 300 = 3%), fixed
    # fields left empty. fixed_per_sale: fixed_amount + fixed_amount_currency
    # required (flat bonus per sale, e.g. 100000 UZS), commission_bps unused.
    commission_bps: int = Field(default=0, ge=0)
    fixed_amount: int | None = Field(default=None, ge=0)
    fixed_amount_currency: Currency | None = None
    # None = applies to every product/category the role sells; set = this
    # plan only applies to sales under that one catalog category (client
    # requirement: different bonus per product).
    catalog_category_id: UUID | None = None
    effective_from: datetime
    effective_to: datetime | None = None


class BonusPlanOut(BaseModel):
    id: UUID
    tenant_id: UUID
    name: str
    applies_to_role_id: UUID
    bonus_type: str
    commission_bps: int
    fixed_amount: int | None
    fixed_amount_currency: str | None
    catalog_category_id: UUID | None
    effective_from: datetime
    effective_to: datetime | None
    idempotency_key: str
    created_at: datetime


class PayrollCalculateRequest(BaseModel):
    period_start: datetime
    period_end: datetime
    user_id: UUID | None = None


class PayrollEntryOut(BaseModel):
    id: UUID
    tenant_id: UUID
    user_id: UUID
    period_start: datetime
    period_end: datetime
    bonus_plan_id: UUID | None
    base_amount: int
    bonus_amount: int
    currency: str
    computed_at: datetime
    computed_by_user_id: UUID


PayrollJobStatus = Literal["pending", "processing", "done", "failed"]


class PayrollJobOut(BaseModel):
    id: UUID
    tenant_id: UUID
    period_start: datetime
    period_end: datetime
    user_id: UUID | None
    status: PayrollJobStatus
    error: str | None
    requested_by_user_id: UUID
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
