from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import Settings, get_settings
from app.core.deps import PlatformAuthContext, get_current_platform_admin, get_pool
from app.modules.auth import users_service
from app.modules.auth.schemas import MeOut, TwoFactorConfirmRequest, TwoFactorSetupOut, TwoFactorVerifyLoginRequest
from app.modules.tenants import service
from app.modules.tenants.schemas import (
    AuditLogOut,
    PlatformAdminLoginRequest,
    PlatformLoginResponse,
    RefreshRequest,
    TenantAdminUserCreate,
    TenantCreate,
    TenantOut,
    TokenPair,
)

router = APIRouter(prefix="/platform/v1", tags=["platform"])


@router.post("/auth/login", response_model=PlatformLoginResponse)
async def platform_login(
    body: PlatformAdminLoginRequest, pool=Depends(get_pool), settings: Settings = Depends(get_settings)
):
    try:
        return await service.platform_login(pool, settings, body.email, body.password)
    except service.InvalidCredentialsError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")


@router.post("/auth/2fa/verify-login", response_model=TokenPair)
async def verify_login_2fa(
    body: TwoFactorVerifyLoginRequest, pool=Depends(get_pool), settings: Settings = Depends(get_settings)
):
    try:
        return await service.platform_verify_login_2fa(pool, settings, body.pending_token, body.code)
    except service.InvalidTwoFactorCodeError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired code")


@router.post("/auth/refresh", response_model=TokenPair)
async def platform_refresh(
    body: RefreshRequest, pool=Depends(get_pool), settings: Settings = Depends(get_settings)
):
    try:
        return await service.platform_refresh(pool, settings, body.refresh_token)
    except service.InvalidRefreshTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired refresh token")


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
async def platform_logout(
    body: RefreshRequest, pool=Depends(get_pool), settings: Settings = Depends(get_settings)
):
    await service.platform_logout(pool, settings, body.refresh_token)


@router.post("/auth/2fa/setup", response_model=TwoFactorSetupOut)
async def setup_2fa(admin: PlatformAuthContext = Depends(get_current_platform_admin), pool=Depends(get_pool)):
    return await service.setup_2fa(pool, admin.admin_id)


@router.post("/auth/2fa/confirm", status_code=status.HTTP_204_NO_CONTENT)
async def confirm_2fa(
    body: TwoFactorConfirmRequest,
    admin: PlatformAuthContext = Depends(get_current_platform_admin),
    pool=Depends(get_pool),
):
    try:
        await service.confirm_2fa(pool, admin.admin_id, body.code)
    except (service.TwoFactorNotSetupError, service.InvalidTwoFactorCodeError):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid code or 2FA not set up")


@router.post("/tenants", response_model=TenantOut, status_code=status.HTTP_201_CREATED)
async def create_tenant(
    body: TenantCreate,
    pool=Depends(get_pool),
    _admin: PlatformAuthContext = Depends(get_current_platform_admin),
):
    try:
        return await service.create_tenant(pool, body.name, body.slug)
    except service.TenantSlugTakenError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Tenant slug already in use")


@router.get("/tenants", response_model=list[TenantOut])
async def list_tenants(pool=Depends(get_pool), _admin: PlatformAuthContext = Depends(get_current_platform_admin)):
    return await service.list_tenants(pool)


@router.post(
    "/tenants/{tenant_id}/admin-user", response_model=MeOut, status_code=status.HTTP_201_CREATED
)
async def create_tenant_admin_user(
    tenant_id: UUID,
    body: TenantAdminUserCreate,
    pool=Depends(get_pool),
    admin: PlatformAuthContext = Depends(get_current_platform_admin),
):
    try:
        return await service.create_tenant_admin_user(
            pool, admin.admin_id, tenant_id, body.email, body.password, body.reason
        )
    except service.TwoFactorRequiredError:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Platform Admin must enable 2FA before accessing tenant data"
        )
    except users_service.EmailTakenError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already in use in this tenant")


@router.get("/audit-logs", response_model=list[AuditLogOut])
async def list_audit_logs(pool=Depends(get_pool), _admin: PlatformAuthContext = Depends(get_current_platform_admin)):
    return await service.list_audit_logs(pool)
