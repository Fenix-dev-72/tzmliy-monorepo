import re
from datetime import datetime
from typing import Literal
from uuid import UUID

from email_validator import EmailNotValidError, validate_email
from pydantic import BaseModel, Field, field_validator

# Loose E.164-ish check -- optional leading '+', 9-15 digits. Just needs to
# reject obvious garbage (test tokens, typos) before it's routed to send_code;
# the phone providers' own webhooks/OTP flows don't parse this further.
_PHONE_RE = re.compile(r"^\+?\d{9,15}$")


def _validate_identifier(value: str) -> str:
    """Shared identifier check for every login/OTP/registration/password-reset
    endpoint that accepts a single email-or-phone field. Rejects malformed
    input at the API boundary (422) instead of silently accepting it and
    letting send_code fail to deliver later with no feedback to the caller --
    e.g. `user@gmailcom` (missing dot) previously passed straight through as
    "channel=email" and got queued for delivery to a domain with no MX record,
    with the request itself reporting success either way."""
    value = value.strip()
    if "@" in value:
        try:
            validate_email(value, check_deliverability=False)
        except EmailNotValidError as exc:
            raise ValueError(f"Email manzil noto'g'ri: {exc}") from exc
    elif not _PHONE_RE.match(value):
        raise ValueError("Telefon raqami noto'g'ri formatda (masalan: +998901234567)")
    return value


class LoginRequest(BaseModel):
    # Email or phone -- globally unique across every tenant (see
    # user_login_identifiers), so no tenant_slug is needed to identify who's
    # logging in; the server resolves the tenant from the identifier itself.
    identifier: str
    password: str

    _validate_identifier = field_validator("identifier")(_validate_identifier)


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
    full_name: str | None = None
    role_id: UUID
    role_name: str
    is_active: bool
    totp_enabled: bool
    created_at: datetime
    # Computed, not stored -- which self-service integration links this user
    # still needs to complete (client requirement, 2026-07-13). Telegram is
    # required for everyone; UTEL/CRM only for roles that hold the matching
    # *.view/manage permission. Empty list = fully onboarded.
    pending_links: list[Literal["telegram", "utel", "crm"]] = []


class PasswordResetRequest(BaseModel):
    identifier: str

    _validate_identifier = field_validator("identifier")(_validate_identifier)


class PasswordResetConfirm(BaseModel):
    # identifier is needed again here (not just the token) because the token
    # is an opaque random string, not a JWT -- there's nothing in it to
    # resolve which tenant's password_reset_tokens table to look in without
    # already knowing the tenant, same chicken-and-egg problem login solves
    # via user_login_identifiers.
    identifier: str
    token: str
    new_password: str = Field(min_length=8, max_length=72)

    _validate_identifier = field_validator("identifier")(_validate_identifier)


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

    _validate_identifier = field_validator("identifier")(_validate_identifier)


class RegistrationCodeVerify(BaseModel):
    identifier: str
    code: str

    _validate_identifier = field_validator("identifier")(_validate_identifier)


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
