from datetime import datetime, timedelta, timezone
from uuid import UUID

import asyncpg

from app.core.config import Settings
from app.core.database import platform_connection, tenant_connection
from app.core.security import encode_token, equalize_password_timing, hash_password, verify_password
from app.modules.analytics import repository
from app.modules.tenants import repository as tenants_repository

# Fixed Asia/Tashkent offset (UTC+5) -- the product spec fixes this tenant-wide
# (dashboarduz-product-overview memory), no timezone-DB dependency needed.
_TASHKENT_TZ = timezone(timedelta(hours=5))


class InvalidPeriodError(Exception):
    pass


class DashboardNameTakenError(Exception):
    pass


class DashboardNotFoundError(Exception):
    pass


class InvalidDashboardCredentialsError(Exception):
    pass


def resolve_period(period_start: datetime | None, period_end: datetime | None) -> tuple[datetime, datetime]:
    if period_start is None and period_end is None:
        now_local = datetime.now(_TASHKENT_TZ)
        period_start = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
        period_end = now_local
    elif period_start is None or period_end is None:
        raise InvalidPeriodError
    if period_end <= period_start:
        raise InvalidPeriodError
    return period_start, period_end


async def create_dashboard(pool: asyncpg.Pool, tenant_id: UUID, name: str, password: str) -> dict:
    password_hash = await hash_password(password)
    async with tenant_connection(pool, tenant_id) as conn:
        row = await repository.insert_dashboard(conn, tenant_id, name, password_hash)
    if row is None:
        raise DashboardNameTakenError
    return row


async def list_dashboards(pool: asyncpg.Pool, tenant_id: UUID) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.list_dashboards(conn)


async def delete_dashboard(pool: asyncpg.Pool, tenant_id: UUID, dashboard_id: UUID) -> None:
    async with tenant_connection(pool, tenant_id) as conn:
        existing = await repository.get_dashboard_by_id(conn, dashboard_id)
        if existing is None:
            raise DashboardNotFoundError
        await repository.delete_dashboard(conn, dashboard_id)


async def dashboard_login(pool: asyncpg.Pool, settings: Settings, tenant_slug: str, name: str, password: str) -> str:
    async with platform_connection(pool) as conn:
        tenant = await tenants_repository.get_tenant_by_slug(conn, tenant_slug)
    if tenant is None:
        # Same-cost dummy verify + generic 401 — see auth/service.py's login
        # for the enumeration/timing reasoning; same rules here.
        await equalize_password_timing(password)
        raise InvalidDashboardCredentialsError

    async with tenant_connection(pool, tenant["id"]) as conn:
        dashboard = await repository.get_dashboard_by_name(conn, name)
        if dashboard is None:
            await equalize_password_timing(password)
            raise InvalidDashboardCredentialsError
        if dashboard["locked_until"] is not None and dashboard["locked_until"] > datetime.now(timezone.utc):
            await equalize_password_timing(password)
            raise InvalidDashboardCredentialsError
        if not await verify_password(password, dashboard["password_hash"]):
            # Commit the increment by exiting the transaction before raising —
            # raising in place would roll it back (see auth/service.py login).
            await repository.record_dashboard_failed_login(
                conn, dashboard["id"], settings.login_max_failed_attempts, settings.login_lockout_minutes
            )
            password_ok = False
        else:
            password_ok = True
            if dashboard["failed_login_attempts"] > 0 or dashboard["locked_until"] is not None:
                await repository.reset_dashboard_failed_logins(conn, dashboard["id"])

    if not password_ok:
        raise InvalidDashboardCredentialsError

    return encode_token(
        {"sub": str(dashboard["id"]), "tenant_id": str(dashboard["tenant_id"]), "type": "dashboard_session"},
        secret=settings.jwt_secret,
        ttl=timedelta(hours=settings.dashboard_session_ttl_hours),
    )


async def get_leaderboard(pool: asyncpg.Pool, tenant_id: UUID, period_start: datetime, period_end: datetime) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.get_leaderboard(conn, period_start, period_end)


async def get_category_sales_summary(
    pool: asyncpg.Pool, tenant_id: UUID, period_start: datetime, period_end: datetime
) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.get_category_sales_summary(conn, period_start, period_end)


async def get_dashboard_summary(pool: asyncpg.Pool, tenant_id: UUID, period_start: datetime, period_end: datetime) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        sales_totals = await repository.get_sales_totals_by_currency(conn, period_start, period_end)
        collected_totals = await repository.get_collected_totals_by_currency(conn, period_start, period_end)
        active_customers_count = await repository.count_active_customers(conn)
        leaderboard = await repository.get_leaderboard(conn, period_start, period_end)

    return {
        "period_start": period_start,
        "period_end": period_end,
        "total_sales_count": sum(row["sales_count"] for row in sales_totals),
        "sales_by_currency": [{"currency": r["currency"], "total_amount": r["total_amount"]} for r in sales_totals],
        "collected_by_currency": [
            {"currency": r["currency"], "total_amount": r["total_amount"]} for r in collected_totals
        ],
        "active_customers_count": active_customers_count,
        "top_sellers": leaderboard[:3],
    }
