from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

CrmProviderName = Literal["amocrm", "bitrix24"]
OAuthProviderName = Literal["amocrm", "bitrix24", "meta_ads"]


class ManagerMappingSelfCreate(BaseModel):
    """Self-service (POST /manager-mappings/me): user_id is always the
    caller's own, forced from the token -- never a body field. Mirrors
    calls/schemas.py's ManagerMappingSelfCreate exactly."""

    provider: CrmProviderName
    external_manager_id: str


class ManagerMappingCreate(BaseModel):
    provider: CrmProviderName
    external_manager_id: str
    user_id: UUID


class ManagerMappingOut(BaseModel):
    id: UUID
    tenant_id: UUID
    provider: str
    external_manager_id: str
    user_id: UUID
    is_active: bool
    created_at: datetime


class AmoCrmConfigure(BaseModel):
    subdomain: str = Field(min_length=1)
    api_token: str = Field(min_length=1)
    webhook_secret: str = Field(min_length=8)


class Bitrix24Configure(BaseModel):
    # application_token is no longer accepted here -- we generate it
    # ourselves (see Bitrix24ConfiguredOut) and hand it back once for the
    # admin to paste into Bitrix24's Outgoing Webhook config, instead of
    # asking them to invent one and paste it to us. One less thing for the
    # admin to make up, same "we generate it" simplification as Telegram's
    # personal-link tokens.
    webhook_base_url: str = Field(min_length=1)


class MetaAdsConfigure(BaseModel):
    ad_account_id: str = Field(min_length=1)
    access_token: str = Field(min_length=1)


class OAuthAuthorizeUrlOut(BaseModel):
    authorize_url: str


class WebhookUrlOut(BaseModel):
    webhook_url: str
    # Only set for bitrix24 -- its inbound webhook is verified via a token
    # in the POST body (Bitrix24Provider.verify_webhook), not a URL query
    # param like amocrm, so the tenant needs both pieces separately.
    application_token: str | None = None


class ManagerCandidateOut(BaseModel):
    external_manager_id: str
    name: str


class IntegrationConfiguredOut(BaseModel):
    id: UUID
    tenant_id: UUID
    provider: str
    external_account_id: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class Bitrix24ConfiguredOut(IntegrationConfiguredOut):
    # Shown right after configuring -- the admin pastes this exact value
    # into Bitrix24's own Outgoing Webhook "application_token" field. Also
    # retrievable afterwards via GET /crm/integrations/bitrix24/webhook-url
    # (2026-07-17) -- unlike a TOTP secret, this needs to survive a page
    # reload without forcing a full reconnect.
    application_token: str


class CrmLeadSyncOut(BaseModel):
    id: UUID
    tenant_id: UUID
    customer_id: UUID
    provider: str
    external_lead_id: str | None
    direction: str
    raw_payload: dict[str, Any] | None
    synced_at: datetime


class AdCampaignOut(BaseModel):
    id: UUID
    tenant_id: UUID
    provider: str
    external_campaign_id: str
    name: str
    status: str
    created_at: datetime
    updated_at: datetime


class AdInsightOut(BaseModel):
    id: UUID
    tenant_id: UUID
    campaign_id: UUID
    insight_date: date
    impressions: int
    clicks: int
    spend_amount: int
    currency: str
    created_at: datetime
