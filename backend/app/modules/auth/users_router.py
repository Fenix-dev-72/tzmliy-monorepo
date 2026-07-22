from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.deps import AuthContext, get_current_user, get_pool, require_permission
from app.modules.auth import users_service
from app.modules.auth.permissions import USERS_MANAGE, USERS_VIEW
from app.modules.auth.users_schemas import UserCreate, UserOut, UserProfileUpdate, UserRoleUpdate

router = APIRouter(prefix="/api/v1/users", tags=["users"])


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreate,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(USERS_MANAGE)),
):
    try:
        return await users_service.create_user(pool, auth.tenant_id, body.email, body.password, body.role_id, body.phone)
    except users_service.EmailTakenError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already in use")
    except users_service.PhoneTakenError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Phone already in use")
    except users_service.RoleNotInTenantError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Role does not belong to this tenant")
    except users_service.CannotAssignAdminRoleError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot assign the owner admin role to an employee")


@router.get("", response_model=list[UserOut])
async def list_users(
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0),
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(USERS_VIEW)),
):
    return await users_service.list_users(pool, auth.tenant_id, limit, offset)


@router.patch("/{user_id}/role", status_code=status.HTTP_204_NO_CONTENT)
async def update_user_role(
    user_id: UUID,
    body: UserRoleUpdate,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(USERS_MANAGE)),
):
    try:
        await users_service.update_user_role(pool, auth.tenant_id, user_id, body.role_id)
    except users_service.UserNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    except users_service.RoleNotInTenantError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Role does not belong to this tenant")
    except users_service.CannotAssignAdminRoleError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot assign the owner admin role to an employee")


@router.patch("/{user_id}/deactivate", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_user(
    user_id: UUID, pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(USERS_MANAGE))
):
    try:
        await users_service.deactivate_user(pool, auth.tenant_id, user_id)
    except users_service.UserNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")


@router.patch("/me/profile", response_model=UserOut)
async def update_own_profile(
    body: UserProfileUpdate, pool=Depends(get_pool), auth: AuthContext = Depends(get_current_user)
):
    # exclude_unset -- a field the client didn't send in the PATCH body must
    # be left untouched, not treated as an explicit null (see users_service's
    # _UNSET sentinel for why).
    try:
        return await users_service.update_user_profile(
            pool, auth.tenant_id, auth.user_id, **body.model_dump(exclude_unset=True)
        )
    except users_service.PhoneTakenError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Phone already in use")


@router.patch("/{user_id}/profile", response_model=UserOut)
async def update_user_profile(
    user_id: UUID,
    body: UserProfileUpdate,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(USERS_MANAGE)),
):
    try:
        return await users_service.update_user_profile(
            pool, auth.tenant_id, user_id, **body.model_dump(exclude_unset=True)
        )
    except users_service.UserNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    except users_service.PhoneTakenError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Phone already in use")
