from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.deps import AuthContext, get_current_user, get_pool, require_permission
from app.core.pagination import Paginated
from app.modules.attendance import service
from app.modules.attendance.schemas import AttendanceOut, AttendancePush
from app.modules.auth.permissions import ATTENDANCE_MANAGE, ATTENDANCE_VIEW

router = APIRouter(prefix="/api/v1/attendance", tags=["attendance"])


@router.post("/check-in", response_model=AttendanceOut, status_code=status.HTTP_201_CREATED)
async def check_in(pool=Depends(get_pool), auth: AuthContext = Depends(get_current_user)):
    try:
        return await service.check_in(pool, auth.tenant_id, auth.user_id)
    except service.AlreadyCheckedInError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Already checked in")


@router.post("/check-out", response_model=AttendanceOut)
async def check_out(pool=Depends(get_pool), auth: AuthContext = Depends(get_current_user)):
    try:
        return await service.check_out(pool, auth.tenant_id, auth.user_id)
    except service.NotCheckedInError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Not checked in")


@router.post("/push", response_model=AttendanceOut, status_code=status.HTTP_201_CREATED)
async def push_attendance(
    body: AttendancePush,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(ATTENDANCE_MANAGE)),
):
    try:
        return await service.push_attendance(pool, auth.tenant_id, body.user_id, body.check_in_at)
    except service.UserNotFoundError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "user_id does not exist in this tenant")
    except service.AlreadyCheckedInError:
        raise HTTPException(status.HTTP_409_CONFLICT, "User already has an open attendance record")


@router.get("", response_model=Paginated[AttendanceOut])
async def list_attendance(
    user_id: UUID | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(ATTENDANCE_VIEW)),
):
    items, total = await service.list_attendance(pool, auth.tenant_id, user_id, limit, offset)
    return Paginated(items=items, total=total)
