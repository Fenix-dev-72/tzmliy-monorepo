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


async def _get_plan_usage(pool: asyncpg.Pool, tenant_ids: list[UUID], plans: list[dict]) -> list[dict]:
    """tenant_subscriptions is tenant-scoped RLS, so which plan each tenant
    is on can't be read in one cross-tenant query -- same tenant-loop shape
    as _get_payments_summary above. Counts are keyed by billing_plan_id then
    mapped back onto every known plan (not just the ones in use) so a brand
    new plan with zero subscribers still shows up as 0, not missing."""
    settings = get_settings()
    semaphore = asyncio.Semaphore(settings.tenant_loop_max_concurrency)

    async def _one(tenant_id: UUID) -> dict | None:
        async with semaphore:
            async with tenant_connection(pool, tenant_id) as conn:
                return await billing_repository.get_tenant_subscription(conn, tenant_id)

    results = await asyncio.gather(*(_one(tid) for tid in tenant_ids))
    counts: dict[UUID, int] = {}
    for sub in results:
        if sub is None:
            continue
        counts[sub["billing_plan_id"]] = counts.get(sub["billing_plan_id"], 0) + 1

    return [
        {"code": p["code"], "name": p["name"], "is_active": p["is_active"], "tenant_count": counts.get(p["id"], 0)}
        for p in plans
    ]


async def list_tenant_storage_usage(pool: asyncpg.Pool) -> list[dict]:
    """Reads each tenant's latest already-computed storage_usage_snapshots
    row (never recomputes -- that's billing/tasks.py's daily job) and joins
    it with the tenant's name and the plan it's actually on, so a Platform
    Admin can see every tenant's usage in one list instead of looking each
    one up individually. Same tenant-loop shape as _get_plan_usage above.
    A tenant with no snapshot yet (no subscription, or hasn't been through a
    daily recalculation cycle) is included with total_bytes=0."""
    async with platform_connection(pool) as conn:
        tenants = await tenants_repository.list_tenants(conn)
        plans_by_id = {p["id"]: p for p in await billing_repository.list_billing_plans(conn)}

    settings = get_settings()
    semaphore = asyncio.Semaphore(settings.tenant_loop_max_concurrency)

    async def _one(tenant: dict) -> dict:
        async with semaphore:
            async with tenant_connection(pool, tenant["id"]) as conn:
                snapshot = await billing_repository.get_latest_storage_usage_snapshot(conn)
                subscription = await billing_repository.get_tenant_subscription(conn, tenant["id"])
        plan = plans_by_id.get(subscription["billing_plan_id"]) if subscription is not None else None
        return {
            "tenant_id": tenant["id"],
            "tenant_name": tenant["name"],
            "plan_code": plan["code"] if plan is not None else None,
            "total_bytes": snapshot["total_bytes"] if snapshot is not None else 0,
            "billable_storage_limit_bytes": snapshot["billable_storage_limit_bytes"] if snapshot is not None else None,
            "usage_ratio_bps": snapshot["usage_ratio_bps"] if snapshot is not None else 0,
            "computed_at": snapshot["computed_at"] if snapshot is not None else None,
        }

    return list(await asyncio.gather(*(_one(t) for t in tenants)))


async def get_dashboard_summary(pool: asyncpg.Pool) -> dict:
    async with platform_connection(pool) as conn:
        tenants = await tenants_repository.list_tenants(conn)
        plans = await billing_repository.list_billing_plans(conn)

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

    payments_today, payments_month, plans_usage = await asyncio.gather(
        _get_payments_summary(pool, tenant_ids, today_start, now),
        _get_payments_summary(pool, tenant_ids, month_start, now),
        _get_plan_usage(pool, tenant_ids, plans),
    )

    return {
        "total_tenants": len(tenants),
        "tenants_by_status": [{"status": k, "count": v} for k, v in tenants_by_status.items()],
        "plans_usage": plans_usage,
        "new_tenants_7d": new_7d,
        "new_tenants_30d": new_30d,
        "payments_today": payments_today,
        "payments_this_month": payments_month,
    }
