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
    # webhook_secret dropped 2026-07-24 -- AmoCRM no longer has a webhook
    # path at all (see crm/providers.py's module docstring), so a manually
    # pasted long-lived token needs nothing beyond the token itself and which
    # account it belongs to.
    subdomain: str = Field(min_length=1)
    api_token: str = Field(min_length=1)


class MetaAdsConfigure(BaseModel):
    ad_account_id: str = Field(min_length=1)
    access_token: str = Field(min_length=1)


class OAuthAuthorizeUrlOut(BaseModel):
    authorize_url: str


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
