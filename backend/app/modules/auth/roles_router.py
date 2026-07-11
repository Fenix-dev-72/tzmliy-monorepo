from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.deps import AuthContext, get_current_user, get_pool, require_permission
from app.modules.auth import roles_service
from app.modules.auth.permissions import ALL_PERMISSIONS, ROLES_MANAGE, ROLES_VIEW
from app.modules.auth.roles_schemas import RoleCreate, RoleOut, RolePermissionsUpdate

router = APIRouter(prefix="/api/v1", tags=["roles"])


@router.get("/permissions", response_model=list[str])
async def list_permissions(_auth: AuthContext = Depends(get_current_user)):
    return sorted(ALL_PERMISSIONS)


@router.post("/roles", response_model=RoleOut, status_code=status.HTTP_201_CREATED)
async def create_role(
    body: RoleCreate, pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(ROLES_MANAGE))
):
    try:
        return await roles_service.create_role(pool, auth.tenant_id, body.name, body.permissions)
    except roles_service.UnknownPermissionError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown permission(s): {exc}")
    except roles_service.RoleNameTakenError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Role name already in use")


@router.get("/roles", response_model=list[RoleOut])
async def list_roles(pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(ROLES_VIEW))):
    return await roles_service.list_roles(pool, auth.tenant_id)


@router.patch("/roles/{role_id}/permissions", response_model=RoleOut)
async def update_role_permissions(
    role_id: UUID,
    body: RolePermissionsUpdate,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(ROLES_MANAGE)),
):
    try:
        return await roles_service.update_role_permissions(pool, auth.tenant_id, role_id, body.permissions)
    except roles_service.UnknownPermissionError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown permission(s): {exc}")
    except roles_service.RoleNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Role not found")
