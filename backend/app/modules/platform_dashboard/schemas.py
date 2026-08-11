from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class TenantStatusCountOut(BaseModel):
    status: str
    count: int


class PaymentTotalOut(BaseModel):
    status: str
    currency: str
    count: int
    total_amount: int


class PlanUsageOut(BaseModel):
    code: str
    name: str
    is_active: bool
    tenant_count: int


class DashboardSummaryOut(BaseModel):
    total_tenants: int
    tenants_by_status: list[TenantStatusCountOut]
    new_tenants_7d: int
    new_tenants_30d: int
    payments_today: list[PaymentTotalOut]
    payments_this_month: list[PaymentTotalOut]
    plans_usage: list[PlanUsageOut]


class TenantStorageUsageOut(BaseModel):
    tenant_id: UUID
    tenant_name: str
    plan_code: str | None
    total_bytes: int
    billable_storage_limit_bytes: int | None
    usage_ratio_bps: int
    computed_at: datetime | None


class SystemIssueOut(BaseModel):
    id: str
    source: Literal["notification", "report_export", "payroll", "backup"]
    tenant_id: UUID | None
    tenant_name: str | None
    title: str
    detail: str | None
    occurred_at: datetime | None


class ServerMetricsOut(BaseModel):
    cpu_percent: float
    memory_percent: float
    memory_used_bytes: int
    memory_total_bytes: int
    disk_percent: float
    disk_used_bytes: int
    disk_total_bytes: int
