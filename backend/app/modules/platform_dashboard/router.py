import asyncio
import json

import psutil
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from app.core.deps import PlatformAuthContext, get_current_platform_admin, get_pool
from app.modules.platform_dashboard import service
from app.modules.platform_dashboard.schemas import DashboardSummaryOut

router = APIRouter(prefix="/platform/v1/dashboard", tags=["platform-dashboard"])

_SERVER_METRICS_POLL_SECONDS = 3


@router.get("/summary", response_model=DashboardSummaryOut)
async def get_summary(
    pool=Depends(get_pool), _admin: PlatformAuthContext = Depends(get_current_platform_admin)
):
    return await service.get_dashboard_summary(pool)


def _collect_server_metrics() -> dict:
    memory = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    return {
        # interval=None (non-blocking): compares against the previous call's
        # CPU times rather than sleeping, per psutil's own recommended usage
        # for repeated sampling -- the first tick in a stream may read 0.0,
        # every tick after is accurate.
        "cpu_percent": psutil.cpu_percent(interval=None),
        "memory_percent": memory.percent,
        "memory_used_bytes": memory.used,
        "memory_total_bytes": memory.total,
        "disk_percent": disk.percent,
        "disk_used_bytes": disk.used,
        "disk_total_bytes": disk.total,
    }


async def _server_metrics_event_source(request: Request):
    # Same shape as analytics/router.py's leaderboard SSE stream: no DB
    # connection held across the sleep, stops cleanly on client disconnect.
    while True:
        if await request.is_disconnected():
            break
        yield f"data: {json.dumps(_collect_server_metrics())}\n\n"
        await asyncio.sleep(_SERVER_METRICS_POLL_SECONDS)


@router.get("/server-metrics/stream")
async def stream_server_metrics(
    request: Request, _admin: PlatformAuthContext = Depends(get_current_platform_admin)
):
    return StreamingResponse(_server_metrics_event_source(request), media_type="text/event-stream")
