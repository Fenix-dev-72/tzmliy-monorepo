"""In-app notification inbox (2026-08-10): the bell icon in the dashboard
header. Separate from the rest of this module's Telegram-outbox/reports
code -- this is a per-user delivery target, not a per-tenant Telegram chat.
Three sources feed it: complaints.reply_to_complaint, this module's own
broadcast endpoint, and billing/tasks.py's payment-due warning.
"""

import asyncio
from uuid import UUID

import asyncpg

from app.core.config import Settings
from app.core.database import platform_connection, tenant_connection
from app.modules.auth import repository as auth_repository
from app.modules.billing import repository as billing_repository
from app.modules.notifications import inbox_repository
from app.modules.tenants import repository as tenants_repository


class TwoFactorRequiredError(Exception):
    """Broadcasting reaches every tenant's users -- same 2FA+reason+audit-log
    guard as tenants/service.py's create_tenant_admin_user."""

    pass


async def notify_user(
    pool: asyncpg.Pool, tenant_id: UUID, user_id: UUID, type: str, title: str, body: str, link: str | None = None
) -> None:
    async with tenant_connection(pool, tenant_id) as conn:
        await inbox_repository.insert_notification(conn, tenant_id, user_id, type, title, body, link)


async def notify_users(
    pool: asyncpg.Pool,
    tenant_id: UUID,
    user_ids: list[UUID],
    type: str,
    title: str,
    body: str,
    link: str | None = None,
) -> None:
    async with tenant_connection(pool, tenant_id) as conn:
        await inbox_repository.insert_notifications_bulk(conn, tenant_id, user_ids, type, title, body, link)


async def list_inbox(pool: asyncpg.Pool, tenant_id: UUID, user_id: UUID, limit: int = 50) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        return await inbox_repository.list_inbox(conn, user_id, limit)


async def count_unread(pool: asyncpg.Pool, tenant_id: UUID, user_id: UUID) -> int:
    async with tenant_connection(pool, tenant_id) as conn:
        return await inbox_repository.count_unread(conn, user_id)


async def mark_read(pool: asyncpg.Pool, tenant_id: UUID, user_id: UUID, notification_id: UUID) -> None:
    async with tenant_connection(pool, tenant_id) as conn:
        await inbox_repository.mark_read(conn, notification_id, user_id)


async def mark_all_read(pool: asyncpg.Pool, tenant_id: UUID, user_id: UUID) -> None:
    async with tenant_connection(pool, tenant_id) as conn:
        await inbox_repository.mark_all_read(conn, user_id)


async def broadcast_notification(
    pool: asyncpg.Pool,
    settings: Settings,
    admin_id: UUID,
    audience: str,
    billing_plan_id: UUID | None,
    title: str,
    body: str,
    reason: str,
) -> dict:
    async with platform_connection(pool) as conn:
        admin = await tenants_repository.get_platform_admin_by_id(conn, admin_id)
        if admin is None or not admin["totp_enabled"]:
            raise TwoFactorRequiredError
        all_tenants = await tenants_repository.list_tenants(conn)

    # Same bounded-concurrency per-tenant loop shape as billing/service.py's
    # run_dunning -- one slow tenant connection must not delay every other
    # tenant's fan-out.
    semaphore = asyncio.Semaphore(settings.tenant_loop_max_concurrency)

    async def _one(tenant: dict) -> int:
        async with semaphore:
            async with tenant_connection(pool, tenant["id"]) as conn:
                if audience == "plan":
                    sub = await billing_repository.get_tenant_subscription(conn, tenant["id"])
                    if sub is None or sub["billing_plan_id"] != billing_plan_id:
                        return 0
                admin_ids = await auth_repository.list_admin_user_ids(conn)
                if not admin_ids:
                    return 0
                await inbox_repository.insert_notifications_bulk(
                    conn, tenant["id"], admin_ids, "broadcast", title, body, None
                )
                return len(admin_ids)

    notified_counts = await asyncio.gather(*(_one(tenant) for tenant in all_tenants))
    tenants_reached = sum(1 for c in notified_counts if c > 0)
    admins_notified = sum(notified_counts)

    async with platform_connection(pool) as conn:
        await tenants_repository.insert_audit_log(
            conn,
            actor_type="platform_admin",
            actor_id=admin_id,
            tenant_id=None,
            action=f"broadcast_notification:{audience}",
            reason=reason,
        )

    return {"tenants_reached": tenants_reached, "admins_notified": admins_notified}
