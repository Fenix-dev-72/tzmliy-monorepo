from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    # Email or phone -- globally unique across every tenant (see
    # user_login_identifiers), so no tenant_slug is needed to identify who's
    # logging in; the server resolves the tenant from the identifier itself.
    identifier: str
    password: str


class LoginResponse(BaseModel):
    requires_2fa: bool = False
    pending_token: str | None = None
    access_token: str | None = None
    refresh_token: str | None = None
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class MeOut(BaseModel):
    id: UUID
    tenant_id: UUID
    email: str | None
    phone: str | None
    role_id: UUID
    role_name: str
    is_active: bool
    totp_enabled: bool
    created_at: datetime


class PasswordResetRequest(BaseModel):
    identifier: str


class PasswordResetConfirm(BaseModel):
    # identifier is needed again here (not just the token) because the token
    # is an opaque random string, not a JWT -- there's nothing in it to
    # resolve which tenant's password_reset_tokens table to look in without
    # already knowing the tenant, same chicken-and-egg problem login solves
    # via user_login_identifiers.
    identifier: str
    token: str
    new_password: str = Field(min_length=8, max_length=72)


class OtpRequest(BaseModel):
    phone: str


class OtpVerify(BaseModel):
    phone: str
    code: str


class RegistrationCodeRequest(BaseModel):
    """Step 1 of self-service tenant registration: identifier is an email or
    a phone number (E.164 for phone). Delivery channel is inferred from
    whether it looks like an email."""
    identifier: str


class RegistrationCodeVerify(BaseModel):
    identifier: str
    code: str


class RegistrationCodeVerifyOut(BaseModel):
    registration_token: str


class RegistrationComplete(BaseModel):
    registration_token: str
    company_name: str = Field(min_length=1)
    slug: str = Field(min_length=1)
    password: str = Field(min_length=8, max_length=72)


class TwoFactorSetupOut(BaseModel):
    secret: str
    otpauth_uri: str


class TwoFactorConfirmRequest(BaseModel):
    code: str


class TwoFactorVerifyLoginRequest(BaseModel):
    pending_token: str
    code: str


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=72)
