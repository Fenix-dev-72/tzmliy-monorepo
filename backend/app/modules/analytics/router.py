import asyncio
import json
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse

from app.core.config import Settings, get_settings
from app.core.deps import AuthContext, DashboardAuthContext, get_current_dashboard, get_pool, require_permission
from app.modules.analytics import service
from app.modules.analytics.schemas import (
    CategorySalesEntryOut,
    DashboardCreate,
    DashboardLoginRequest,
    DashboardOut,
    DashboardSummaryOut,
    DashboardTokenOut,
    LeaderboardEntryOut,
)
from app.modules.auth.permissions import ANALYTICS_MANAGE, ANALYTICS_VIEW


def _default_encoder(value):
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


async def _leaderboard_event_source(request: Request, pool, tenant_id: UUID, settings: Settings):
    while True:
        if await request.is_disconnected():
            break
        period_start, period_end = service.resolve_period(None, None)
        entries = await service.get_leaderboard(pool, tenant_id, period_start, period_end)
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
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(ANALYTICS_VIEW)),
):
    try:
        start, end = service.resolve_period(period_start, period_end)
    except service.InvalidPeriodError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "period_end must be after period_start")
    return await service.get_leaderboard(pool, auth.tenant_id, start, end)


@router.get("/leaderboard/stream")
async def stream_leaderboard(
    request: Request,
    pool=Depends(get_pool),
    settings: Settings = Depends(get_settings),
    auth: AuthContext = Depends(require_permission(ANALYTICS_VIEW)),
):
    return StreamingResponse(
        _leaderboard_event_source(request, pool, auth.tenant_id, settings), media_type="text/event-stream"
    )


@router.get("/course-sales", response_model=list[CategorySalesEntryOut])
async def get_course_sales(
    period_start: datetime | None = None,
    period_end: datetime | None = None,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(ANALYTICS_VIEW)),
):
    try:
        start, end = service.resolve_period(period_start, period_end)
    except service.InvalidPeriodError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "period_end must be after period_start")
    return await service.get_category_sales_summary(pool, auth.tenant_id, start, end)


@router.get("/summary", response_model=DashboardSummaryOut)
async def get_summary(
    period_start: datetime | None = None,
    period_end: datetime | None = None,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(ANALYTICS_VIEW)),
):
    try:
        start, end = service.resolve_period(period_start, period_end)
    except service.InvalidPeriodError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "period_end must be after period_start")
    return await service.get_dashboard_summary(pool, auth.tenant_id, start, end)


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
    pool=Depends(get_pool), dashboard: DashboardAuthContext = Depends(get_current_dashboard)
):
    start, end = service.resolve_period(None, None)
    return await service.get_leaderboard(pool, dashboard.tenant_id, start, end)


@dashboard_router.get("/leaderboard/stream")
async def dashboard_stream_leaderboard(
    request: Request,
    pool=Depends(get_pool),
    settings: Settings = Depends(get_settings),
    dashboard: DashboardAuthContext = Depends(get_current_dashboard),
):
    return StreamingResponse(
        _leaderboard_event_source(request, pool, dashboard.tenant_id, settings), media_type="text/event-stream"
    )


@dashboard_router.get("/course-sales", response_model=list[CategorySalesEntryOut])
async def dashboard_get_course_sales(
    pool=Depends(get_pool), dashboard: DashboardAuthContext = Depends(get_current_dashboard)
):
    start, end = service.resolve_period(None, None)
    return await service.get_category_sales_summary(pool, dashboard.tenant_id, start, end)


@dashboard_router.get("/summary", response_model=DashboardSummaryOut)
async def dashboard_get_summary(
    pool=Depends(get_pool), dashboard: DashboardAuthContext = Depends(get_current_dashboard)
):
    start, end = service.resolve_period(None, None)
    return await service.get_dashboard_summary(pool, dashboard.tenant_id, start, end)
