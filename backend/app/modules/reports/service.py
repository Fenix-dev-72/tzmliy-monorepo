from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

import asyncpg

from app.core.database import tenant_connection
from app.modules.reports import repository

DEFAULT_STALE_ADJUSTMENT_DAYS = 3

ExportEntity = Literal["customers", "sales", "finance", "calls"]

_EXPORT_FETCHERS = {
    "customers": repository.export_customers,
    "sales": repository.export_sales,
    "finance": repository.export_ledger_entries,
    "calls": repository.export_calls,
}


async def get_diagnostics(pool: asyncpg.Pool, tenant_id: UUID, stale_days: int = DEFAULT_STALE_ADJUSTMENT_DAYS) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        sales_without_charge_entry = await repository.get_sales_without_charge_entry(conn)
        stale_pending_adjustment_requests = await repository.get_stale_pending_adjustment_requests(conn, stale_days)
        negative_balance_sales = await repository.get_negative_balance_sales(conn)
        webhook_events_backlog = await repository.get_webhook_events_backlog(conn)
        notification_outbox_backlog = await repository.get_notification_outbox_backlog(conn)

    return {
        "generated_at": datetime.now(timezone.utc),
        "sales_without_charge_entry": sales_without_charge_entry,
        "stale_pending_adjustment_requests": stale_pending_adjustment_requests,
        "negative_balance_sales": negative_balance_sales,
        "webhook_events_backlog": webhook_events_backlog,
        "notification_outbox_backlog": notification_outbox_backlog,
    }


async def export_entity(pool: asyncpg.Pool, tenant_id: UUID, entity: ExportEntity) -> list[dict]:
    fetch = _EXPORT_FETCHERS[entity]
    async with tenant_connection(pool, tenant_id) as conn:
        return await fetch(conn)
