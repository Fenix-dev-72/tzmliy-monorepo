from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.deps import AuthContext, get_pool, get_replica_pool, require_permission
from app.modules.auth.permissions import REPORTS_EXPORT, REPORTS_VIEW
from app.modules.reports import service
from app.modules.reports.schemas import DiagnosticsOut, ExportJobOut

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])


@router.get("/diagnostics", response_model=DiagnosticsOut)
async def get_diagnostics(
    period_start: datetime | None = Query(
        None, description="Negative-balance check window start; defaults to the last 90 days. Pass an older date for a longer or full-history window."
    ),
    replica_pool=Depends(get_replica_pool),
    auth: AuthContext = Depends(require_permission(REPORTS_VIEW)),
):
    return await service.get_diagnostics(replica_pool, auth.tenant_id, period_start=period_start)


@router.post("/export/{entity}", response_model=ExportJobOut, status_code=status.HTTP_202_ACCEPTED)
async def export_entity(
    entity: Literal["customers", "sales", "finance", "calls"],
    format: Literal["csv", "xlsx"] = "csv",
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(REPORTS_EXPORT)),
):
    """Enqueues the export instead of generating it synchronously --
    export_worker.py picks it up in the background. Poll
    GET /export/jobs/{id} for status; once status=done, download_url is a
    short-lived presigned URL to the generated file."""
    return await service.enqueue_export(pool, auth.tenant_id, entity, format, auth.user_id)


@router.get("/export/jobs/{job_id}", response_model=ExportJobOut)
async def get_export_job(
    job_id: UUID, pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(REPORTS_EXPORT))
):
    try:
        return await service.get_export_job(pool, auth.tenant_id, job_id)
    except service.ExportJobNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Export job not found")
