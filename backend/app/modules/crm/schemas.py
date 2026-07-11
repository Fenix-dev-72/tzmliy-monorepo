from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class AmoCrmConfigure(BaseModel):
    subdomain: str = Field(min_length=1)
    api_token: str = Field(min_length=1)
    webhook_secret: str = Field(min_length=8)


class Bitrix24Configure(BaseModel):
    webhook_base_url: str = Field(min_length=1)
    application_token: str = Field(min_length=1)


class MetaAdsConfigure(BaseModel):
    ad_account_id: str = Field(min_length=1)
    access_token: str = Field(min_length=1)


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
