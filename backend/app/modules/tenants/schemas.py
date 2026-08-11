import re
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator

# tenants.slug is trusted as a DNS label for per-tenant subdomains
# ({slug}.tizimly.uz) -- must be validated server-side, not just by the
# frontend's own slugify()/regex check, since a malformed slug here could
# break subdomain routing or enable subdomain-confusion. 3-63 chars matches
# a real DNS label's practical minimum/maximum.
_SLUG_RE = re.compile(r"^[a-z0-9-]{3,63}$")


def _validate_slug(value: str) -> str:
    if not _SLUG_RE.match(value):
        raise ValueError("slug must be 3-63 lowercase letters, digits, or hyphens")
    return value


class PlatformAdminLoginRequest(BaseModel):
    email: EmailStr
    password: str


class PlatformLoginResponse(BaseModel):
    requires_2fa: bool = False
    pending_token: str | None = None
    access_token: str | None = None
    refresh_token: str | None = None
    token_type: str = "bearer"
    resend_after_seconds: int = 0


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TenantCreate(BaseModel):
    name: str
    slug: str

    _validate_slug = field_validator("slug")(_validate_slug)


class TenantPublicOut(BaseModel):
    """Minimal, unauthenticated tenant lookup by slug -- backs the
    subdomain-branded login page ({slug}.tizimly.uz). Deliberately excludes
    everything except name/status; never expose id/trial_ends_at/etc. here,
    this endpoint has no auth at all."""

    name: str
    status: str


class TenantOut(BaseModel):
    id: UUID
    name: str
    slug: str
    status: str
    trial_ends_at: datetime | None
    created_at: datetime


class TenantAdminUserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    reason: str = Field(min_length=3)


class AuditLogOut(BaseModel):
    id: UUID
    actor_type: str
    actor_id: UUID
    tenant_id: UUID | None
    action: str
    reason: str
    created_at: datetime
