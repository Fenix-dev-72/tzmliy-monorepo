from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

Currency = Literal["UZS", "USD"]
PlanCode = Literal["starter", "business", "enterprise"]
PaymentProviderName = Literal["click", "payme"]


class BillingPlanOut(BaseModel):
    id: UUID
    code: str
    name: str
    price_amount: int
    currency: str
    billing_period_months: int
    max_users: int
    max_billable_storage_bytes: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class BillingPlanUpdate(BaseModel):
    price_amount: int | None = Field(default=None, ge=0)
    currency: Currency | None = None
    max_users: int | None = Field(default=None, gt=0)
    max_billable_storage_bytes: int | None = Field(default=None, gt=0)
    is_active: bool | None = None


class TenantSubscriptionOut(BaseModel):
    id: UUID
    tenant_id: UUID
    billing_plan_id: UUID
    current_period_start: datetime
    current_period_end: datetime
    warning_80_sent_at: datetime | None
    warning_100_sent_at: datetime | None
    created_at: datetime
    updated_at: datetime


class SubscriptionAssignRequest(BaseModel):
    billing_plan_code: PlanCode
    current_period_start: datetime | None = None
    reason: str = Field(min_length=3)


class SubscriptionSelectRequest(BaseModel):
    billing_plan_code: PlanCode


class SubscriptionPaymentOut(BaseModel):
    id: UUID
    tenant_id: UUID
    tenant_subscription_id: UUID
    billing_plan_id: UUID
    provider: str
    amount: int
    currency: str
    status: str
    period_start: datetime
    period_end: datetime
    idempotency_key: str
    review_idempotency_key: str | None
    provider_transaction_id: str | None
    provider_state: int | None
    cancel_reason: int | None
    created_by_user_id: UUID | None
    created_by_admin_id: UUID | None
    created_at: datetime
    performed_at: datetime | None
    cancelled_at: datetime | None


class PaymentInitiateRequest(BaseModel):
    provider: PaymentProviderName


class PaymentInitiateResponse(BaseModel):
    payment_id: UUID
    provider: str
    checkout_url: str


class ManualInvoiceCreate(BaseModel):
    amount: int = Field(gt=0)
    currency: Currency
    period_start: datetime | None = None
    period_end: datetime | None = None
    reason: str = Field(min_length=3)


class ReasonRequest(BaseModel):
    reason: str = Field(min_length=3)


class StorageUsageOut(BaseModel):
    id: UUID
    tenant_id: UUID
    snapshot_date: date
    db_bytes: int
    object_storage_bytes: int
    total_bytes: int
    billable_storage_limit_bytes: int
    usage_ratio_bps: int
    computed_at: datetime


class DunningRunResultOut(BaseModel):
    tenant_id: UUID
    old_status: str
    new_status: str
