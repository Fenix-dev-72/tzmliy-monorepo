import asyncio
import json
from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse

from app.core.config import Settings, get_settings
from app.core.deps import (
    AuthContext,
    DashboardAuthContext,
    get_current_dashboard,
    get_pool,
    get_redis,
    get_replica_pool,
    require_permission,
)
from app.modules.analytics import service
from app.modules.analytics.schemas import (
    CategorySalesEntryOut,
    DashboardCreate,
    DashboardLoginRequest,
    DashboardOut,
    DashboardSummaryOut,
    DashboardTokenOut,
    DebtSummaryOut,
    LeaderboardEntryOut,
    LeadQualitySummaryOut,
    RevenueBucketOut,
    SellerKpisOut,
)
from app.modules.auth.permissions import ANALYTICS_MANAGE, ANALYTICS_VIEW, SALES_VIEW_ALL, USERS_VIEW


def _default_encoder(value):
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


_LEADERBOARD_CACHE_PREFIX = "sse_cache:leaderboard:"


async def _get_cached_leaderboard(
    redis_client, replica_pool, tenant_id: UUID, period_start, period_end, ttl_seconds: int, caller_id: UUID, can_view_all: bool
):
    """optimize.md #27 (2026-07-18): every open dashboard tab used to run its
    own independent DB query on every SSE tick -- a tenant with 10 employees
    watching the live leaderboard at once meant the same query run 10 times a
    tick. Cache-aside on Redis, keyed per-tenant (period_end is "now" and
    changes every tick, but caching by period_start/tenant alone is enough:
    the cached value is only served for up to one poll interval, so it's
    never more than one tick stale) -- whichever connection's tick first
    finds an expired/missing key recomputes it from the DB and every other
    open connection for that tenant reuses the same cached result until the
    next TTL expiry, cutting DB load by roughly the number of concurrent
    viewers instead of multiplying it.

    Own-data scoping (2026-07-22): the shared cache only applies when
    can_view_all -- every viewer sees the same tenant-wide ranking, so
    caching by tenant alone is correct. A caller without sales.view_all only
    ever gets back their own single row, which isn't safe to share across
    users, so that case bypasses the cache entirely (a single-row query per
    tick is cheap)."""
    if not can_view_all:
        return await service.get_leaderboard(replica_pool, tenant_id, period_start, period_end, caller_id, can_view_all)
    cache_key = f"{_LEADERBOARD_CACHE_PREFIX}{tenant_id}"
    cached = await redis_client.get(cache_key)
    if cached is not None:
        return json.loads(cached)
    entries = await service.get_leaderboard(replica_pool, tenant_id, period_start, period_end, caller_id, can_view_all)
    await redis_client.set(cache_key, json.dumps(entries, default=_default_encoder), ex=ttl_seconds)
    return entries


async def _leaderboard_event_source(
    request: Request, replica_pool, redis_client, tenant_id: UUID, settings: Settings, caller_id: UUID, can_view_all: bool
):
    while True:
        if await request.is_disconnected():
            break
        period_start, period_end = service.resolve_period(None, None)
        entries = await _get_cached_leaderboard(
            redis_client, replica_pool, tenant_id, period_start, period_end, settings.analytics_sse_poll_seconds,
            caller_id, can_view_all,
        )
        yield f"data: {json.dumps(entries, default=_default_encoder)}\n\n"
        await asyncio.sleep(settings.analytics_sse_poll_seconds)


# --- Tenant-facing ------------------------------------------------------

router = APIRouter(prefix="/api/v1/analytics", tags=["analytics"])


@router.post("/dashboards", response_model=DashboardOut, status_code=status.HTTP_201_CREATED)
async def create_dashboard(
    body: DashboardCreate, pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(ANALYTICS_MANAGE))
):
    try:
        return await service.create_dashboard(pool, auth.tenant_id, body.name, body.password)
    except service.DashboardNameTakenError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Dashboard name already in use")


@router.get("/dashboards", response_model=list[DashboardOut])
async def list_dashboards(pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(ANALYTICS_MANAGE))):
    return await service.list_dashboards(pool, auth.tenant_id)


@router.delete("/dashboards/{dashboard_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dashboard(
    dashboard_id: UUID, pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(ANALYTICS_MANAGE))
):
    try:
        await service.delete_dashboard(pool, auth.tenant_id, dashboard_id)
    except service.DashboardNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dashboard not found")


@router.get("/leaderboard", response_model=list[LeaderboardEntryOut])
async def get_leaderboard(
    period_start: datetime | None = None,
    period_end: datetime | None = None,
    replica_pool=Depends(get_replica_pool),
    auth: AuthContext = Depends(require_permission(ANALYTICS_VIEW)),
):
    try:
        start, end = service.resolve_period(period_start, period_end)
    except service.InvalidPeriodError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "period_end must be after period_start")
    can_view_all = SALES_VIEW_ALL in auth.permissions
    return await service.get_leaderboard(replica_pool, auth.tenant_id, start, end, auth.user_id, can_view_all)


@router.get("/leaderboard/stream")
async def stream_leaderboard(
    request: Request,
    replica_pool=Depends(get_replica_pool),
    redis_client=Depends(get_redis),
    settings: Settings = Depends(get_settings),
    auth: AuthContext = Depends(require_permission(ANALYTICS_VIEW)),
):
    can_view_all = SALES_VIEW_ALL in auth.permissions
    return StreamingResponse(
        _leaderboard_event_source(request, replica_pool, redis_client, auth.tenant_id, settings, auth.user_id, can_view_all),
        media_type="text/event-stream",
    )


@router.get("/course-sales", response_model=list[CategorySalesEntryOut])
async def get_course_sales(
    period_start: datetime | None = None,
    period_end: datetime | None = None,
    replica_pool=Depends(get_replica_pool),
    auth: AuthContext = Depends(require_permission(ANALYTICS_VIEW)),
):
    try:
        start, end = service.resolve_period(period_start, period_end)
    except service.InvalidPeriodError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "period_end must be after period_start")
    can_view_all = SALES_VIEW_ALL in auth.permissions
    return await service.get_category_sales_summary(replica_pool, auth.tenant_id, start, end, auth.user_id, can_view_all)


@router.get("/summary", response_model=DashboardSummaryOut)
async def get_summary(
    period_start: datetime | None = None,
    period_end: datetime | None = None,
    replica_pool=Depends(get_replica_pool),
    auth: AuthContext = Depends(require_permission(ANALYTICS_VIEW)),
):
    try:
        start, end = service.resolve_period(period_start, period_end)
    except service.InvalidPeriodError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "period_end must be after period_start")
    can_view_all = SALES_VIEW_ALL in auth.permissions
    return await service.get_dashboard_summary(replica_pool, auth.tenant_id, start, end, auth.user_id, can_view_all)


@router.get("/revenue-timeseries", response_model=list[RevenueBucketOut])
async def get_revenue_timeseries(
    period: Literal["day", "week", "month"] = Query("week"),
    replica_pool=Depends(get_replica_pool),
    auth: AuthContext = Depends(require_permission(ANALYTICS_VIEW)),
):
    can_view_all = SALES_VIEW_ALL in auth.permissions
    return await service.get_revenue_timeseries(replica_pool, auth.tenant_id, period, auth.user_id, can_view_all)


@router.get("/debt-summary", response_model=list[DebtSummaryOut])
async def get_debt_summary(
    replica_pool=Depends(get_replica_pool), auth: AuthContext = Depends(require_permission(ANALYTICS_VIEW))
):
    can_view_all = SALES_VIEW_ALL in auth.permissions
    return await service.get_debt_summary(replica_pool, auth.tenant_id, auth.user_id, can_view_all)


@router.get("/lead-quality-summary", response_model=LeadQualitySummaryOut)
async def get_lead_quality_summary(
    period_start: datetime | None = None,
    period_end: datetime | None = None,
    replica_pool=Depends(get_replica_pool),
    auth: AuthContext = Depends(require_permission(ANALYTICS_VIEW)),
):
    try:
        start, end = service.resolve_period(period_start, period_end)
    except service.InvalidPeriodError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "period_end must be after period_start")
    can_view_all = SALES_VIEW_ALL in auth.permissions
    return await service.get_lead_quality_summary(replica_pool, auth.tenant_id, start, end, auth.user_id, can_view_all)


@router.get("/sellers/{user_id}/kpis", response_model=SellerKpisOut)
async def get_seller_kpis(
    user_id: UUID,
    period_start: datetime | None = None,
    period_end: datetime | None = None,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(USERS_VIEW)),
):
    """Per-seller KPI detail page (2026-07-13) -- gated by users.view (not
    analytics.view): the leaderboard's own totals stay visible to everyone
    with analytics.view (including agents ranking themselves), but this
    detail view exposes another employee's debt-collection/refund
    performance, which is more sensitive -- users.view is already granted to
    admin/manager/finance but not agent in DEFAULT_ROLE_PERMISSIONS."""
    try:
        start, end = service.resolve_period(period_start, period_end)
    except service.InvalidPeriodError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "period_end must be after period_start")
    return await service.get_seller_kpis(pool, auth.tenant_id, user_id, start, end)


# --- Dashboard-facing (per-dashboard password, not a tenant user) ---------

dashboard_router = APIRouter(prefix="/api/v1/dashboard-sessions", tags=["analytics-dashboard"])


@dashboard_router.post("/login", response_model=DashboardTokenOut)
async def dashboard_login(
    body: DashboardLoginRequest, pool=Depends(get_pool), settings: Settings = Depends(get_settings)
):
    try:
        token = await service.dashboard_login(pool, settings, body.tenant_slug, body.name, body.password)
    except service.InvalidDashboardCredentialsError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid dashboard credentials")
    return DashboardTokenOut(access_token=token)


@dashboard_router.get("/leaderboard", response_model=list[LeaderboardEntryOut])
async def dashboard_get_leaderboard(
    replica_pool=Depends(get_replica_pool), dashboard: DashboardAuthContext = Depends(get_current_dashboard)
):
    start, end = service.resolve_period(None, None)
    # Kiosk dashboards show the same tenant-wide leaderboard to everyone by
    # design (see CLAUDE.md's Analytics section) -- always can_view_all=True;
    # dashboard_id is just a placeholder caller_id, never read when True.
    return await service.get_leaderboard(replica_pool, dashboard.tenant_id, start, end, dashboard.dashboard_id, True)


@dashboard_router.get("/leaderboard/stream")
async def dashboard_stream_leaderboard(
    request: Request,
    replica_pool=Depends(get_replica_pool),
    redis_client=Depends(get_redis),
    settings: Settings = Depends(get_settings),
    dashboard: DashboardAuthContext = Depends(get_current_dashboard),
):
    return StreamingResponse(
        _leaderboard_event_source(
            request, replica_pool, redis_client, dashboard.tenant_id, settings, dashboard.dashboard_id, True
        ),
        media_type="text/event-stream",
    )


@dashboard_router.get("/course-sales", response_model=list[CategorySalesEntryOut])
async def dashboard_get_course_sales(
    replica_pool=Depends(get_replica_pool), dashboard: DashboardAuthContext = Depends(get_current_dashboard)
):
    start, end = service.resolve_period(None, None)
    return await service.get_category_sales_summary(
        replica_pool, dashboard.tenant_id, start, end, dashboard.dashboard_id, True
    )


@dashboard_router.get("/summary", response_model=DashboardSummaryOut)
async def dashboard_get_summary(
    replica_pool=Depends(get_replica_pool), dashboard: DashboardAuthContext = Depends(get_current_dashboard)
):
    start, end = service.resolve_period(None, None)
    return await service.get_dashboard_summary(replica_pool, dashboard.tenant_id, start, end, dashboard.dashboard_id, True)
