import asyncio
from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import UUID

import asyncpg

from app.core.config import Settings
from app.core.database import platform_connection, read_tenant_connection, tenant_connection
from app.core.security import encode_token, equalize_password_timing, hash_password, verify_password
from app.modules.analytics import repository
from app.modules.crm import service as crm_service
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


async def get_leaderboard(
    replica_pool: asyncpg.Pool,
    tenant_id: UUID,
    period_start: datetime,
    period_end: datetime,
    caller_id: UUID,
    can_view_all: bool,
) -> list[dict]:
    # Scaling-prep (2026-07-18): read-only -> replica_pool (identical to
    # today until replica_database_url is configured, see core/database.py).
    async with read_tenant_connection(replica_pool, tenant_id) as conn:
        return await repository.get_leaderboard(conn, period_start, period_end, caller_id, can_view_all)


async def get_category_sales_summary(
    replica_pool: asyncpg.Pool,
    tenant_id: UUID,
    period_start: datetime,
    period_end: datetime,
    caller_id: UUID,
    can_view_all: bool,
) -> list[dict]:
    async with read_tenant_connection(replica_pool, tenant_id) as conn:
        return await repository.get_category_sales_summary(conn, period_start, period_end, caller_id, can_view_all)


async def get_dashboard_summary(
    replica_pool: asyncpg.Pool,
    tenant_id: UUID,
    period_start: datetime,
    period_end: datetime,
    caller_id: UUID,
    can_view_all: bool,
) -> dict:
    async with read_tenant_connection(replica_pool, tenant_id) as conn:
        sales_totals = await repository.get_sales_totals_by_currency(conn, period_start, period_end, caller_id, can_view_all)
        collected_totals = await repository.get_collected_totals_by_currency(
            conn, period_start, period_end, caller_id, can_view_all
        )
        active_customers_count = await repository.count_active_customers(conn, caller_id, can_view_all)
        leaderboard = await repository.get_leaderboard(conn, period_start, period_end, caller_id, can_view_all)

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


def _bucket_boundaries(period: Literal["day", "week", "month"], now_tashkent: datetime) -> tuple[list[datetime], timedelta]:
    if period == "day":
        delta, count = timedelta(hours=1), 24
        anchor = now_tashkent.replace(minute=0, second=0, microsecond=0)
    elif period == "week":
        delta, count = timedelta(days=1), 7
        anchor = now_tashkent.replace(hour=0, minute=0, second=0, microsecond=0)
    else:  # "month"
        delta, count = timedelta(days=1), 30
        anchor = now_tashkent.replace(hour=0, minute=0, second=0, microsecond=0)
    start = anchor - delta * (count - 1)
    return [start + delta * i for i in range(count)], delta


async def get_revenue_timeseries(
    replica_pool: asyncpg.Pool,
    tenant_id: UUID,
    period: Literal["day", "week", "month"],
    caller_id: UUID,
    can_view_all: bool,
) -> list[dict]:
    """optimize.md #25 (2026-07-18): now bucketed in SQL (date_trunc over
    created_at AT TIME ZONE 'Asia/Tashkent', see queries.sql) instead of
    fetching every raw row and summing in Python -- the `AT TIME ZONE`
    conversion happens explicitly per-row before truncation, so this doesn't
    depend on (and isn't broken by) Postgres's session timezone the way a
    bare date_trunc(created_at) would be. Bucket boundaries/labels are still
    generated in Python (_bucket_boundaries) so the response's bucket_start
    list is always complete and gap-filled, even for buckets with zero rows.
    Always keyed by (bucket, currency) -- money is per-currency BIGINT, never
    mixed."""
    now_tashkent = datetime.now(_TASHKENT_TZ)
    boundaries, delta = _bucket_boundaries(period, now_tashkent)
    period_start, period_end = boundaries[0], now_tashkent
    unit = "hour" if period == "day" else "day"

    async with read_tenant_connection(replica_pool, tenant_id) as conn:
        sales_rows = await repository.get_sales_timeseries_buckets(
            conn, period_start, period_end, unit, caller_id, can_view_all
        )
        collected_rows = await repository.get_collected_timeseries_buckets(
            conn, period_start, period_end, unit, caller_id, can_view_all
        )

    # bucket_start from SQL is a naive local-wall-clock timestamp (the
    # AT TIME ZONE conversion strips the offset) -- key boundaries the same
    # way so they match exactly, no per-row _bucket_index math needed anymore.
    boundary_index_by_naive = {b.replace(tzinfo=None): idx for idx, b in enumerate(boundaries)}

    def _index_for(bucket_start) -> int | None:
        return boundary_index_by_naive.get(bucket_start)

    sales_by_bucket: dict[tuple[int, str], int] = {}
    for row in sales_rows:
        idx = _index_for(row["bucket_start"])
        if idx is None:
            continue
        key = (idx, row["currency"])
        sales_by_bucket[key] = sales_by_bucket.get(key, 0) + row["amount"]

    collected_by_bucket: dict[tuple[int, str], int] = {}
    for row in collected_rows:
        idx = _index_for(row["bucket_start"])
        if idx is None:
            continue
        key = (idx, row["currency"])
        collected_by_bucket[key] = collected_by_bucket.get(key, 0) + row["amount"]

    currencies = sorted({c for _, c in sales_by_bucket} | {c for _, c in collected_by_bucket})
    return [
        {
            "bucket_start": bucket_start,
            "currency": currency,
            "sales_amount": sales_by_bucket.get((idx, currency), 0),
            "collected_amount": collected_by_bucket.get((idx, currency), 0),
        }
        for idx, bucket_start in enumerate(boundaries)
        for currency in currencies
    ]


async def get_debt_summary(
    replica_pool: asyncpg.Pool, tenant_id: UUID, caller_id: UUID, can_view_all: bool
) -> list[dict]:
    async with read_tenant_connection(replica_pool, tenant_id) as conn:
        return await repository.get_outstanding_debt_by_currency(conn, caller_id, can_view_all)


def _pct(numerator: int, denominator: int) -> float | None:
    return round(numerator / denominator * 100, 1) if denominator else None


async def get_lead_quality_summary(
    replica_pool: asyncpg.Pool,
    tenant_id: UUID,
    period_start: datetime,
    period_end: datetime,
    caller_id: UUID,
    can_view_all: bool,
) -> dict:
    """Tenant-wide counterpart to get_seller_kpis' lead-funnel section
    (client requirement, 2026-07-15: "umumiy ishlarni adminga ko'rsatish
    kerak") -- same fields, summed across every seller instead of one, unless
    the caller lacks sales.view_all (own-data scoping, 2026-07-22 -- reused
    here as the single gate for every tenant-wide analytics widget, sales- or
    customer-derived alike), in which case it's scoped down to just their own
    leads."""
    async with read_tenant_connection(replica_pool, tenant_id) as conn:
        summary = await repository.get_tenant_lead_quality_summary(
            conn, period_start, period_end, caller_id, can_view_all
        )
    return {
        "period_start": period_start,
        "period_end": period_end,
        "received_count": summary["received_count"],
        "active_count": summary["active_count"],
        "won_count": summary["won_count"],
        "lost_count": summary["lost_count"],
        "quality_count": summary["quality_count"],
        "low_quality_count": summary["low_quality_count"],
        "conversion_pct": _pct(summary["won_count"], summary["received_count"]),
    }


_SELLER_MODE_LABELS = ("online", "offline", "intensive")


async def get_seller_kpis(
    pool: asyncpg.Pool, tenant_id: UUID, user_id: UUID, period_start: datetime, period_end: datetime
) -> dict:
    """Per-seller KPI dashboard (2026-07-13, expanded 2026-07-15). Nine
    independent, single-purpose, indexed queries -- one per stat group,
    fanned out with asyncio.gather instead of the original sequential
    single-transaction version, mirroring reports/service.py's
    get_diagnostics parallelization. Each gets its OWN tenant_connection
    (hence own asyncpg connection): one connection can't run concurrent
    queries, so sharing one across gather() would just serialize them again
    under the hood. Follow-up is pulled separately (real external I/O, see
    crm_service.get_seller_followup_stats) since it's not a DB query at all."""

    async def _q(repo_fn):
        async with tenant_connection(pool, tenant_id) as conn:
            return await repo_fn(conn, user_id, period_start, period_end)

    (
        leads_count,
        sales,
        debt,
        refunds,
        sales_by_mode,
        calls,
        crm_activity,
        lead_funnel,
        lead_response,
    ) = await asyncio.gather(
        _q(repository.get_seller_leads_count),
        _q(repository.get_seller_sales_count),
        _q(repository.get_seller_debt_collection),
        _q(repository.get_seller_refund_rate),
        _q(repository.get_seller_sales_by_mode),
        _q(repository.get_seller_call_stats),
        _q(repository.get_seller_crm_activity_stats),
        _q(repository.get_seller_lead_funnel),
        _q(repository.get_seller_lead_response_time),
    )

    followup = await crm_service.get_seller_followup_stats(pool, tenant_id, user_id, period_start, period_end)

    sales_by_mode_out = [
        {
            "mode": row["delivery_mode"],
            "currency": row["currency"],
            "sales_count": row["sales_count"],
            "agreed_amount": row["agreed_amount"],
            "collected_amount": row["collected_amount"],
        }
        for row in sales_by_mode
    ]

    active_days = calls["active_days"] or 0
    daily_talk_seconds = round(calls["total_duration_seconds"] / active_days) if active_days else None

    return {
        "period_start": period_start,
        "period_end": period_end,
        "leads_count": leads_count,
        "sales_count": sales["count"],
        "conversion_pct": _pct(sales["count"], leads_count),
        "sales_total_uzs": sales["total_uzs"],
        "sales_total_usd": sales["total_usd"],
        "debt_collection_pct": _pct(debt["collected_on_time"], debt["total_due"]),
        "refund_pct": _pct(refunds["sales_with_refund"], refunds["total_sales"]),
        "followup_pct": followup["pct"] if followup else None,
        "followup_total": followup["total"] if followup else None,
        "followup_linked": followup is not None,
        "sales_by_mode": sales_by_mode_out,
        "calls_total": calls["total"],
        "calls_outbound": calls["outbound"],
        "calls_inbound": calls["inbound"],
        "calls_missed_pct": _pct(calls["missed"], calls["total"]),
        "calls_avg_duration_seconds": round(calls["avg_duration_seconds"]) if calls["total"] else None,
        "calls_daily_talk_seconds": daily_talk_seconds,
        "crm_notes_count": crm_activity["notes_count"],
        "crm_stage_changes_count": crm_activity["stage_changes_count"],
        "leads_active_count": lead_funnel["active_count"],
        "leads_won_count": lead_funnel["won_count"],
        "leads_lost_count": lead_funnel["lost_count"],
        "leads_quality_count": lead_funnel["quality_count"],
        "leads_low_quality_count": lead_funnel["low_quality_count"],
        "lead_response_median_seconds": (
            round(lead_response["median_seconds"]) if lead_response["sample_count"] >= 3 else None
        ),
    }
