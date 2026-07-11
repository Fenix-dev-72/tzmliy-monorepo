from typing import Literal

from fastapi import APIRouter, Depends, Response

from app.core.deps import AuthContext, get_pool, require_permission
from app.modules.auth.permissions import REPORTS_EXPORT, REPORTS_VIEW
from app.modules.reports import export_writers, service
from app.modules.reports.schemas import DiagnosticsOut

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])

_EXPORT_COLUMNS = {
    "customers": export_writers.CUSTOMERS_COLUMNS,
    "sales": export_writers.SALES_COLUMNS,
    "finance": export_writers.FINANCE_COLUMNS,
    "calls": export_writers.CALLS_COLUMNS,
}

_MEDIA_TYPES = {
    "csv": "text/csv",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


@router.get("/diagnostics", response_model=DiagnosticsOut)
async def get_diagnostics(pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(REPORTS_VIEW))):
    return await service.get_diagnostics(pool, auth.tenant_id)


@router.get("/export/{entity}")
async def export_entity(
    entity: Literal["customers", "sales", "finance", "calls"],
    format: Literal["csv", "xlsx"] = "csv",
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(REPORTS_EXPORT)),
):
    rows = await service.export_entity(pool, auth.tenant_id, entity)
    columns = _EXPORT_COLUMNS[entity]
    if format == "csv":
        content = export_writers.rows_to_csv(rows, columns)
    else:
        content = export_writers.rows_to_xlsx(rows, columns)
    return Response(
        content=content,
        media_type=_MEDIA_TYPES[format],
        headers={"Content-Disposition": f'attachment; filename="{entity}.{format}"'},
    )
