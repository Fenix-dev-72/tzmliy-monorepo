from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import Settings, get_settings
from app.core.deps import AuthContext, get_current_user, get_pool, get_redis
from app.modules.auth import service
from app.modules.auth.schemas import (
    LoginRequest,
    LoginResponse,
    MeOut,
    OtpRequest,
    OtpVerify,
    PasswordChangeRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
    RefreshRequest,
    RegistrationCodeRequest,
    RegistrationCodeVerify,
    RegistrationCodeVerifyOut,
    RegistrationComplete,
    TwoFactorConfirmRequest,
    TwoFactorSetupOut,
    TwoFactorVerifyLoginRequest,
)
from app.modules.tenants.schemas import TokenPair

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest, pool=Depends(get_pool), settings: Settings = Depends(get_settings)):
    try:
        return await service.login(pool, settings, body.identifier, body.password)
    except service.InvalidCredentialsError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")


@router.post("/register/request-code", status_code=status.HTTP_204_NO_CONTENT)
async def request_registration_code(
    body: RegistrationCodeRequest,
    pool=Depends(get_pool),
    redis_client=Depends(get_redis),
    settings: Settings = Depends(get_settings),
):
    try:
        await service.request_registration_code(pool, redis_client, settings, body.identifier)
    except service.IdentifierTakenError:
        raise HTTPException(status.HTTP_409_CONFLICT, "This email/phone is already registered")


@router.post("/register/verify-code", response_model=RegistrationCodeVerifyOut)
async def verify_registration_code(
    body: RegistrationCodeVerify,
    pool=Depends(get_pool),
    redis_client=Depends(get_redis),
    settings: Settings = Depends(get_settings),
):
    try:
        token = await service.verify_registration_code(pool, redis_client, settings, body.identifier, body.code)
    except service.InvalidRegistrationCodeError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired code")
    return RegistrationCodeVerifyOut(registration_token=token)


@router.post("/register/complete", response_model=TokenPair)
async def complete_registration(
    body: RegistrationComplete, pool=Depends(get_pool), settings: Settings = Depends(get_settings)
):
    try:
        return await service.complete_registration(
            pool, settings, body.registration_token, body.company_name, body.slug, body.password
        )
    except service.InvalidRegistrationTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired registration token")
    except service.IdentifierTakenError:
        raise HTTPException(status.HTTP_409_CONFLICT, "This email/phone is already registered")
    except service.TenantSlugTakenError:
        raise HTTPException(status.HTTP_409_CONFLICT, "This company slug is already in use")


@router.post("/refresh", response_model=TokenPair)
async def refresh(body: RefreshRequest, pool=Depends(get_pool), settings: Settings = Depends(get_settings)):
    try:
        return await service.refresh(pool, settings, body.refresh_token)
    except service.InvalidRefreshTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired refresh token")


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(body: RefreshRequest, pool=Depends(get_pool), settings: Settings = Depends(get_settings)):
    await service.logout(pool, settings, body.refresh_token)


@router.get("/me", response_model=MeOut)
async def me(auth: AuthContext = Depends(get_current_user), pool=Depends(get_pool)):
    user = await service.get_user(pool, auth.tenant_id, auth.user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return user


@router.post("/password-reset/request", status_code=status.HTTP_204_NO_CONTENT)
async def request_password_reset(
    body: PasswordResetRequest,
    pool=Depends(get_pool),
    redis_client=Depends(get_redis),
    settings: Settings = Depends(get_settings),
):
    await service.request_password_reset(pool, redis_client, settings, body.identifier)


@router.post("/password-reset/confirm", status_code=status.HTTP_204_NO_CONTENT)
async def confirm_password_reset(body: PasswordResetConfirm, pool=Depends(get_pool), redis_client=Depends(get_redis)):
    try:
        await service.confirm_password_reset(pool, redis_client, body.identifier, body.token, body.new_password)
    except service.InvalidResetTokenError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired reset token")


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    body: PasswordChangeRequest, auth: AuthContext = Depends(get_current_user), pool=Depends(get_pool)
):
    try:
        await service.change_password(pool, auth.tenant_id, auth.user_id, body.current_password, body.new_password)
    except service.InvalidCurrentPasswordError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Current password is incorrect")


@router.post("/otp/request", status_code=status.HTTP_204_NO_CONTENT)
async def request_otp(
    body: OtpRequest, pool=Depends(get_pool), redis_client=Depends(get_redis), settings: Settings = Depends(get_settings)
):
    await service.request_otp(pool, redis_client, settings, body.phone)


@router.post("/otp/verify", response_model=TokenPair)
async def verify_otp(
    body: OtpVerify, pool=Depends(get_pool), redis_client=Depends(get_redis), settings: Settings = Depends(get_settings)
):
    try:
        return await service.verify_otp(pool, redis_client, settings, body.phone, body.code)
    except service.InvalidOtpError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired code")


@router.post("/2fa/setup", response_model=TwoFactorSetupOut)
async def setup_2fa(auth: AuthContext = Depends(get_current_user), pool=Depends(get_pool)):
    return await service.setup_2fa(pool, auth.tenant_id, auth.user_id)


@router.post("/2fa/confirm", status_code=status.HTTP_204_NO_CONTENT)
async def confirm_2fa(
    body: TwoFactorConfirmRequest, auth: AuthContext = Depends(get_current_user), pool=Depends(get_pool)
):
    try:
        await service.confirm_2fa(pool, auth.tenant_id, auth.user_id, body.code)
    except (service.TwoFactorNotSetupError, service.InvalidTwoFactorCodeError):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid code or 2FA not set up")


@router.post("/2fa/verify-login", response_model=TokenPair)
async def verify_login_2fa(
    body: TwoFactorVerifyLoginRequest, pool=Depends(get_pool), settings: Settings = Depends(get_settings)
):
    try:
        return await service.verify_login_2fa(pool, settings, body.pending_token, body.code)
    except service.InvalidTwoFactorCodeError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired code")
