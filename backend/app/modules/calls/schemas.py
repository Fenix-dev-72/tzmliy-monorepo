from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

ProviderName = Literal["utel", "moi_zvonki"]


class IntegrationCredentialCreate(BaseModel):
    provider: ProviderName
    webhook_secret: str
    api_key: str | None = None


class IntegrationCredentialOut(BaseModel):
    id: UUID
    tenant_id: UUID
    provider: str
    # utel's per-company subdomain (e.g. "cc341") or moi_zvonki's account
    # domain (e.g. "test" for test.moizvonki.ru) -- set by their respective
    # quick_connect_* flows in service.py.
    external_account_id: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class UtelConnectRequest(BaseModel):
    """Real UTEL account credentials, used once to obtain a bearer token via
    UTEL's own POST /v1/auth/login and then discarded -- never persisted
    (see calls/utel_client.py and service.py's quick_connect_utel).
    `subdomain` is the per-company code from that tenant's own UTEL
    dashboard URL (e.g. "cc341" for https://cc341.utel.uz/dashboard) -- UTEL
    has no shared API host, each company's real API lives at
    https://api.{subdomain}.utel.uz."""

    subdomain: str
    email: str
    password: str


class MoiZvonkiConnectRequest(BaseModel):
    """Real "Мои звонки" account credentials -- unlike UTEL, this provider
    has no login endpoint at all; api_key is a pre-existing, long-lived
    credential the tenant copies from their own account settings (Настройки
    -> Интеграция), paired with their account email (user_name). `domain` is
    the per-account subdomain (e.g. "test" for test.moizvonki.ru, confirmed
    via the live API docs' own example). See calls/moi_zvonki_client.py and
    service.py's quick_connect_moi_zvonki."""

    domain: str
    user_name: str
    api_key: str


class WebhookInfoOut(BaseModel):
    webhook_url: str
    # Neither UTEL nor Мои звонки document a real signature scheme for their
    # webhooks -- verification for both is a shared-secret query param this
    # app embeds itself into the URL it registers (see providers.py's
    # verify_signature), shown here as a separate field mainly for
    # informational/debugging purposes since it's already inside the URL.
    webhook_secret: str


class ManagerMappingCreate(BaseModel):
    provider: ProviderName
    external_agent_id: str
    user_id: UUID


class ManagerMappingSelfCreate(BaseModel):
    """Self-service variant (POST /manager-mappings/me) -- no user_id field
    at all, since it's always forced to the caller's own token, never a body
    value (same shape as attendance's check-in vs. the admin-only /push)."""

    provider: ProviderName
    external_agent_id: str


class ManagerMappingOut(BaseModel):
    id: UUID
    tenant_id: UUID
    provider: str
    external_agent_id: str
    user_id: UUID
    is_active: bool
    created_at: datetime


class CallOut(BaseModel):
    id: UUID
    tenant_id: UUID
    provider: str
    external_call_id: str
    direction: str
    from_number: str
    to_number: str
    responsible_user_id: UUID | None
    duration_seconds: int
    recording_object_key: str | None
    status: str
    started_at: datetime
    ended_at: datetime | None
    created_at: datetime


class RecordingUrlOut(BaseModel):
    url: str
