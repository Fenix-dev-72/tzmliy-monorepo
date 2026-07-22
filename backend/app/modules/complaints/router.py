from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.deps import AuthContext, PlatformAuthContext, get_current_platform_admin, get_current_user, get_pool
from app.modules.complaints import service
from app.modules.complaints.schemas import ComplaintCreate, ComplaintOut, ComplaintStatusUpdate

# Tenant-facing: any authenticated employee can submit a complaint, no
# permission required -- same "self-service, no gate" reasoning as
# attendance's own check-in.
tenant_router = APIRouter(prefix="/api/v1/complaints", tags=["complaints"])


@tenant_router.post("", response_model=ComplaintOut, status_code=status.HTTP_201_CREATED)
async def create_complaint(
    body: ComplaintCreate, pool=Depends(get_pool), auth: AuthContext = Depends(get_current_user)
):
    return await service.create_complaint(pool, auth.tenant_id, auth.user_id, body.subject, body.message)


# Platform-facing: Platform Admin reads/resolves complaints across every tenant.
platform_router = APIRouter(prefix="/platform/v1/complaints", tags=["platform-complaints"])


@platform_router.get("", response_model=list[ComplaintOut])
async def list_complaints(
    status_filter: str | None = Query(None, alias="status"),
    pool=Depends(get_pool),
    _admin: PlatformAuthContext = Depends(get_current_platform_admin),
):
    return await service.list_complaints(pool, status_filter)


@platform_router.patch("/{complaint_id}", response_model=ComplaintOut)
async def update_complaint_status(
    complaint_id: UUID,
    body: ComplaintStatusUpdate,
    pool=Depends(get_pool),
    admin: PlatformAuthContext = Depends(get_current_platform_admin),
):
    try:
        return await service.update_complaint_status(pool, complaint_id, body.status, admin.admin_id)
    except service.ComplaintNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Complaint not found")
