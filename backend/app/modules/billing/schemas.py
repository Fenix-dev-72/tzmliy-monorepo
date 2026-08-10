from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

Currency = Literal["UZS", "USD"]
PlanCode = str
PaymentProviderName = Literal["click", "payme"]

_PLAN_CODE_FIELD = Field(pattern=r"^[a-z0-9-]+$", min_length=1, max_length=64)


class BillingPlanOut(BaseModel):
    id: UUID
    code: str
    name: str
    price_amount: int
    currency: str
    billing_period_months: int
    max_users: int
    max_billable_storage_bytes: int
    features_uz: list[str]
    features_ru: list[str]
    feature_keys: list[str]
    is_popular: bool
    is_active: bool
    is_trial: bool
    trial_days: int | None
    created_at: datetime
    updated_at: datetime


class BillingPlanPublicOut(BaseModel):
    code: str
    name: str
    price_amount: int
    currency: str
    billing_period_months: int
    max_users: int
    features_uz: list[str]
    features_ru: list[str]
    is_popular: bool
    is_trial: bool
    trial_days: int | None


class BillingPlanCreate(BaseModel):
    code: str = _PLAN_CODE_FIELD
    name: str = Field(min_length=1)
    price_amount: int = Field(ge=0)
    currency: Currency
    billing_period_months: int = Field(default=1, gt=0)
    max_users: int = Field(gt=0)
    max_billable_storage_bytes: int = Field(gt=0)
    features_uz: list[str] = Field(default_factory=list)
    features_ru: list[str] = Field(default_factory=list)
    feature_keys: list[str] = Field(default_factory=list)
    is_popular: bool = False
    is_active: bool = True
    is_trial: bool = False
    trial_days: int | None = Field(default=None, gt=0)
    reason: str = Field(min_length=3)


class BillingPlanUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    price_amount: int | None = Field(default=None, ge=0)
    currency: Currency | None = None
    max_users: int | None = Field(default=None, gt=0)
    max_billable_storage_bytes: int | None = Field(default=None, gt=0)
    features_uz: list[str] | None = None
    features_ru: list[str] | None = None
    feature_keys: list[str] | None = None
    is_popular: bool | None = None
    is_active: bool | None = None
    is_trial: bool | None = None
    trial_days: int | None = Field(default=None, gt=0)


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


class BillingEntitlementsOut(BaseModel):
    plan_code: str | None
    plan_name: str | None
    max_users: int | None
    current_user_count: int
    max_billable_storage_bytes: int | None
    feature_keys: list[str]


class DunningRunResultOut(BaseModel):
    tenant_id: UUID
    old_status: str
    new_status: str
