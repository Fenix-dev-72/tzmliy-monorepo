"""Platform Admin monitoring dashboard (2026-07-22). No repository.py/
sql/queries.sql here -- this module owns no table of its own, it only
aggregates data that already lives in tenants/billing, reusing their
existing repository functions directly rather than duplicating queries."""

import asyncio
from datetime import datetime, timedelta, timezone
from uuid import UUID

import asyncpg

from app.core.config import get_settings
from app.core.database import platform_connection, tenant_connection
from app.modules.billing import repository as billing_repository
from app.modules.tenants import repository as tenants_repository


def _merge_payment_totals(rows_per_tenant: list[list[dict]]) -> list[dict]:
    merged: dict[tuple[str, str], dict] = {}
    for rows in rows_per_tenant:
        for row in rows:
            key = (row["status"], row["currency"])
            bucket = merged.setdefault(key, {"status": row["status"], "currency": row["currency"], "count": 0, "total_amount": 0})
            bucket["count"] += row["count"]
            bucket["total_amount"] += row["total_amount"]
    return list(merged.values())


async def _get_payments_summary(
    pool: asyncpg.Pool, tenant_ids: list[UUID], period_start: datetime, period_end: datetime
) -> list[dict]:
    """subscription_payments carries RLS (tenant-scoped), so a single
    cross-tenant query isn't possible -- same tenant-loop-with-semaphore
    shape as billing/service.py's run_dunning, bounded by the same
    Settings.tenant_loop_max_concurrency."""
    settings = get_settings()
    semaphore = asyncio.Semaphore(settings.tenant_loop_max_concurrency)

    async def _one(tenant_id: UUID) -> list[dict]:
        async with semaphore:
            async with tenant_connection(pool, tenant_id) as conn:
                return await billing_repository.get_payment_totals_by_status(conn, period_start, period_end)

    results = await asyncio.gather(*(_one(tid) for tid in tenant_ids))
    return _merge_payment_totals(results)


async def get_dashboard_summary(pool: asyncpg.Pool) -> dict:
    async with platform_connection(pool) as conn:
        tenants = await tenants_repository.list_tenants(conn)

    now = datetime.now(timezone.utc)
    tenants_by_status: dict[str, int] = {}
    new_7d = 0
    new_30d = 0
    for t in tenants:
        tenants_by_status[t["status"]] = tenants_by_status.get(t["status"], 0) + 1
        age = now - t["created_at"]
        if age <= timedelta(days=7):
            new_7d += 1
        if age <= timedelta(days=30):
            new_30d += 1

    tenant_ids = [t["id"] for t in tenants]
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    payments_today, payments_month = await asyncio.gather(
        _get_payments_summary(pool, tenant_ids, today_start, now),
        _get_payments_summary(pool, tenant_ids, month_start, now),
    )

    return {
        "total_tenants": len(tenants),
        "tenants_by_status": [{"status": k, "count": v} for k, v in tenants_by_status.items()],
        "new_tenants_7d": new_7d,
        "new_tenants_30d": new_30d,
        "payments_today": payments_today,
        "payments_this_month": payments_month,
    }
