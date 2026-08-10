"""Celery tasks for billing's daily background jobs: storage-usage
recalculation (2026-08-09, backs enforce_storage_not_exceeded's blocking
check, which only ever reads the latest snapshot, never recomputes it
inline) and the payment-due warning (2026-08-10, fires an in-app
notification exactly once, 2 days before a subscription's current period
ends -- deliberately NOT the same thing as run_dunning's status-advance
ladder, which only reacts *after* the period has already lapsed and stays
admin-triggered per explicit user decision).

Reuses notifications/tasks.py's run_async/get_pool, same convention as
backups/tasks.py.
"""

import asyncio
from datetime import datetime, timedelta, timezone

from app.core.celery_app import celery_app
from app.core.config import get_settings
from app.core.database import platform_connection, tenant_connection
from app.modules.auth import repository as auth_repository
from app.modules.notifications import inbox_service
from app.modules.notifications.tasks import get_pool, run_async
from app.modules.tenants import repository as tenants_repository

from . import repository, service


async def _recalculate_all_tenants_storage() -> None:
    pool = get_pool()
    settings = get_settings()
    async with platform_connection(pool) as conn:
        tenants = await tenants_repository.list_tenants(conn)

    semaphore = asyncio.Semaphore(settings.tenant_loop_max_concurrency)

    async def _one(tenant_id) -> None:
        async with semaphore:
            try:
                await service._recalculate_storage_for_tenant(pool, tenant_id, settings, force=True)
            except service.SubscriptionNotFoundError:
                pass  # tenant has no subscription yet, nothing to compute

    await asyncio.gather(*(_one(t["id"]) for t in tenants))


@celery_app.task(name="billing.recalculate_storage_daily")
def recalculate_storage_daily_task() -> None:
    run_async(_recalculate_all_tenants_storage())


async def _send_payment_due_warnings() -> None:
    pool = get_pool()
    settings = get_settings()
    async with platform_connection(pool) as conn:
        tenants = await tenants_repository.list_tenants(conn)

    now = datetime.now(timezone.utc)
    horizon = now + timedelta(days=2)
    semaphore = asyncio.Semaphore(settings.tenant_loop_max_concurrency)

    async def _one(tenant: dict) -> None:
        # Only tenants still in good standing -- once past_due/grace/
        # suspended, run_dunning's ladder is the relevant signal, not a
        # "your payment is coming up" heads-up.
        if tenant["status"] not in ("trial", "active"):
            return
        async with semaphore:
            async with tenant_connection(pool, tenant["id"]) as conn:
                sub = await repository.get_tenant_subscription(conn, tenant["id"])
                if sub is None or sub["current_period_end"] > horizon or sub["current_period_end"] <= now:
                    return
                if sub["payment_due_warning_sent_at"] is not None and sub["payment_due_warning_sent_at"] >= sub[
                    "current_period_start"
                ]:
                    return  # already warned for this period

                plan = await repository.get_billing_plan_by_id(conn, sub["billing_plan_id"])
                admin_ids = await auth_repository.list_admin_user_ids(conn)
                if admin_ids:
                    days_left = max(0, (sub["current_period_end"] - now).days)
                    plan_label = plan["name"] if plan else ""
                    await inbox_service.notify_users(
                        pool,
                        tenant["id"],
                        admin_ids,
                        "payment_due",
                        "To'lov muddati yaqinlashmoqda",
                        f"{plan_label} tarifingiz {days_left} kundan so'ng yangilanishi kerak, "
                        f"aks holda xizmat to'xtatilishi mumkin.",
                        link="/dashboard/settings/billing",
                    )
                await repository.set_payment_due_warning_sent(conn, tenant["id"])

    await asyncio.gather(*(_one(t) for t in tenants))


@celery_app.task(name="billing.send_payment_due_warnings_daily")
def send_payment_due_warnings_daily_task() -> None:
    run_async(_send_payment_due_warnings())
