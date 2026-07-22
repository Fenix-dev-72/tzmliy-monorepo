from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class SaleWithoutChargeEntryOut(BaseModel):
    sale_id: UUID
    customer_id: UUID
    price_amount: int
    currency: str
    created_at: datetime


class StalePendingAdjustmentRequestOut(BaseModel):
    id: UUID
    sale_id: UUID
    type: str
    created_at: datetime
    age_days: int


class NegativeBalanceSaleOut(BaseModel):
    sale_id: UUID
    currency: str
    balance: int


class WebhookEventsBacklogEntryOut(BaseModel):
    provider: str
    unprocessed_count: int
    oldest_created_at: datetime | None


class NotificationOutboxBacklogEntryOut(BaseModel):
    status: str
    count: int
    oldest_created_at: datetime | None


class DiagnosticsOut(BaseModel):
    generated_at: datetime
    sales_without_charge_entry: list[SaleWithoutChargeEntryOut]
    stale_pending_adjustment_requests: list[StalePendingAdjustmentRequestOut]
    negative_balance_sales: list[NegativeBalanceSaleOut]
    webhook_events_backlog: list[WebhookEventsBacklogEntryOut]
    notification_outbox_backlog: list[NotificationOutboxBacklogEntryOut]


ExportJobStatus = Literal["pending", "processing", "done", "failed"]


class ExportJobOut(BaseModel):
    id: UUID
    tenant_id: UUID
    entity: str
    format: str
    status: ExportJobStatus
    error: str | None
    download_url: str | None = None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
