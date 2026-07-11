from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.core.deps import AuthContext, get_pool, require_permission
from app.modules.auth.permissions import CRM_MANAGE, CRM_VIEW
from app.modules.crm import service
from app.modules.crm.providers import CrmApiError, UnknownProviderError
from app.modules.crm.schemas import (
    AdCampaignOut,
    AdInsightOut,
    AmoCrmConfigure,
    Bitrix24Configure,
    CrmLeadSyncOut,
    IntegrationConfiguredOut,
    MetaAdsConfigure,
)

router = APIRouter(prefix="/api/v1/crm", tags=["crm"])


@router.post("/integrations/amocrm", response_model=IntegrationConfiguredOut, status_code=status.HTTP_201_CREATED)
async def configure_amocrm(
    body: AmoCrmConfigure, pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(CRM_MANAGE))
):
    return await service.configure_amocrm(pool, auth.tenant_id, body.subdomain, body.api_token, body.webhook_secret)


@router.post("/integrations/bitrix24", response_model=IntegrationConfiguredOut, status_code=status.HTTP_201_CREATED)
async def configure_bitrix24(
    body: Bitrix24Configure, pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(CRM_MANAGE))
):
    return await service.configure_bitrix24(pool, auth.tenant_id, body.webhook_base_url, body.application_token)


@router.post("/integrations/meta-ads", response_model=IntegrationConfiguredOut, status_code=status.HTTP_201_CREATED)
async def configure_meta_ads(
    body: MetaAdsConfigure, pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(CRM_MANAGE))
):
    return await service.configure_meta_ads(pool, auth.tenant_id, body.ad_account_id, body.access_token)


@router.post("/webhooks/{provider}/{tenant_id}")
async def ingest_webhook(provider: str, tenant_id: UUID, request: Request, pool=Depends(get_pool)):
    raw_body = await request.body()
    try:
        return await service.ingest_webhook(
            pool, provider, tenant_id, raw_body, dict(request.headers), dict(request.query_params)
        )
    except UnknownProviderError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown CRM provider")
    except service.IntegrationNotConfiguredError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Integration not configured for this tenant")
    except service.InvalidWebhookSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid webhook signature/token")
    except service.InvalidWebhookPayloadError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unrecognized or incomplete lead payload")


@router.post("/customers/{customer_id}/push", response_model=CrmLeadSyncOut)
async def push_customer(
    customer_id: UUID,
    provider: str,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(CRM_MANAGE)),
):
    try:
        return await service.push_customer_to_crm(pool, auth.tenant_id, customer_id, provider)
    except UnknownProviderError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown CRM provider")
    except service.CustomerNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer not found")
    except service.IntegrationNotConfiguredError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Integration not configured for this tenant")
    except CrmApiError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"CRM provider error: {exc.message}")


@router.get("/leads", response_model=list[CrmLeadSyncOut])
async def list_leads(pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(CRM_VIEW))):
    return await service.list_lead_syncs(pool, auth.tenant_id)


@router.get("/ad-campaigns", response_model=list[AdCampaignOut])
async def list_ad_campaigns(pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(CRM_VIEW))):
    return await service.list_ad_campaigns(pool, auth.tenant_id)


@router.get("/ad-insights", response_model=list[AdInsightOut])
async def list_ad_insights(
    campaign_id: UUID | None = None,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(CRM_VIEW)),
):
    return await service.list_ad_insights(pool, auth.tenant_id, campaign_id)
