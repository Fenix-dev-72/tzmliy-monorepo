from pydantic import BaseModel


class TenantStatusCountOut(BaseModel):
    status: str
    count: int


class PaymentTotalOut(BaseModel):
    status: str
    currency: str
    count: int
    total_amount: int


class DashboardSummaryOut(BaseModel):
    total_tenants: int
    tenants_by_status: list[TenantStatusCountOut]
    new_tenants_7d: int
    new_tenants_30d: int
    payments_today: list[PaymentTotalOut]
    payments_this_month: list[PaymentTotalOut]


class ServerMetricsOut(BaseModel):
    cpu_percent: float
    memory_percent: float
    memory_used_bytes: int
    memory_total_bytes: int
    disk_percent: float
    disk_used_bytes: int
    disk_total_bytes: int
