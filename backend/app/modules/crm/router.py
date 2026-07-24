import asyncio
import json
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse, StreamingResponse

from app.core.config import Settings, get_settings
from app.core.deps import AuthContext, get_current_user, get_pool, get_redis, require_permission
from app.modules.auth.permissions import CRM_MANAGE, CRM_VIEW
from app.modules.crm import service
from app.modules.crm.providers import CrmApiError, UnknownProviderError
from app.modules.crm.schemas import (
    AdCampaignOut,
    AdInsightOut,
    AmoCrmConfigure,
    CrmLeadSyncOut,
    IntegrationConfiguredOut,
    ManagerCandidateOut,
    ManagerMappingCreate,
    ManagerMappingOut,
    ManagerMappingSelfCreate,
    MetaAdsConfigure,
    OAuthAuthorizeUrlOut,
    OAuthProviderName,
)

router = APIRouter(prefix="/api/v1/crm", tags=["crm"])


def _default_encoder(value):
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


_LEAD_SYNC_CACHE_PREFIX = "sse_cache:crm_leads:"


async def _get_cached_leads(redis_client, pool, tenant_id: UUID, ttl_seconds: int):
    """optimize.md #27 (2026-07-18): same cache-aside fix as analytics'
    _get_cached_leaderboard -- every open IntegrationsPage tab used to run
    its own list_lead_syncs query every tick; now the first connection to see
    an expired/missing key recomputes it and every other connection for that
    tenant reuses the cached result until the next TTL expiry."""
    cache_key = f"{_LEAD_SYNC_CACHE_PREFIX}{tenant_id}"
    cached = await redis_client.get(cache_key)
    if cached is not None:
        return json.loads(cached)
    leads = await service.list_lead_syncs(pool, tenant_id)
    await redis_client.set(cache_key, json.dumps(leads, default=_default_encoder), ex=ttl_seconds)
    return leads


async def _lead_sync_event_source(request: Request, pool, redis_client, tenant_id: UUID, settings: Settings):
    """Mirrors analytics/router.py's _leaderboard_event_source -- same
    poll-and-push shape (not a real push from the webhook handler itself,
    just a short interval), reusing analytics_sse_poll_seconds rather than
    adding a near-duplicate setting. Added 2026-07-17: IntegrationsPage's
    "Lidlar tarixi" table only ever fetched once on mount, so a webhook lead
    landing in the DB seconds after the page loaded stayed invisible until a
    manual reload -- this closes that gap the same way the leaderboard's own
    live-update problem was already solved."""
    while True:
        if await request.is_disconnected():
            break
        leads = await _get_cached_leads(redis_client, pool, tenant_id, settings.analytics_sse_poll_seconds)
        yield f"data: {json.dumps(leads, default=_default_encoder)}\n\n"
        await asyncio.sleep(settings.analytics_sse_poll_seconds)


@router.post("/integrations/amocrm", response_model=IntegrationConfiguredOut, status_code=status.HTTP_201_CREATED)
async def configure_amocrm(
    body: AmoCrmConfigure, pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(CRM_MANAGE))
):
    return await service.configure_amocrm(pool, auth.tenant_id, body.subdomain, body.api_token)


@router.post("/integrations/meta-ads", response_model=IntegrationConfiguredOut, status_code=status.HTTP_201_CREATED)
async def configure_meta_ads(
    body: MetaAdsConfigure, pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(CRM_MANAGE))
):
    return await service.configure_meta_ads(pool, auth.tenant_id, body.ad_account_id, body.access_token)


@router.get("/integrations", response_model=list[IntegrationConfiguredOut])
async def list_integrations(pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(CRM_VIEW))):
    return await service.list_integrations(pool, auth.tenant_id)


@router.delete("/integrations/{provider}", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect_integration(
    provider: str, pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(CRM_MANAGE))
):
    await service.disconnect_integration(pool, auth.tenant_id, provider)


@router.get("/oauth/{provider}/authorize-url", response_model=OAuthAuthorizeUrlOut)
async def get_oauth_authorize_url(
    provider: OAuthProviderName,
    domain: str | None = Query(None, description="Portal/account subdomain -- required for amocrm and bitrix24"),
    auth: AuthContext = Depends(require_permission(CRM_MANAGE)),
):
    """"1 tugma bilan ulash" -- returns the URL as JSON rather than
    redirecting itself, since this is an authenticated bearer-token API call
    and a plain browser navigation can't carry that header. The frontend
    fetches this, then navigates the browser to the *returned* external URL."""
    try:
        url = await service.get_oauth_authorize_url(auth.tenant_id, auth.user_id, provider, domain)
        return OAuthAuthorizeUrlOut(authorize_url=url)
    except service.OAuthNotConfiguredError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{provider} OAuth is not configured yet")
    except service.OAuthDomainRequiredError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{provider} requires a portal/account subdomain")


@router.get("/oauth/{provider}/callback")
async def oauth_callback(
    provider: OAuthProviderName,
    code: str = Query(...),
    state: str = Query(...),
    referer: str | None = Query(None, description="amoCRM only -- the account's own address, e.g. subdomain.amocrm.ru"),
    pool=Depends(get_pool),
    settings: Settings = Depends(get_settings),
):
    """No auth dependency -- the provider redirects the raw browser here with
    no bearer token, same class of exception as the webhook route below;
    tenant identity comes from the Redis-stored state, not a session. Always
    ends in an HTTP redirect back to the frontend, never JSON -- this URL is
    only ever hit by a real browser following the provider's own redirect."""
    # amoCRM's authorize step is domain-agnostic (see crm/oauth.py), so the
    # account subdomain is only known now, from its own `referer` param
    # (e.g. "samandarorifjonov749.amocrm.ru") -- strip the host down to the
    # bare subdomain the rest of this module expects everywhere else.
    callback_domain = referer.split(".")[0] if referer else None
    try:
        await service.complete_oauth(pool, provider, code, state, callback_domain)
        return RedirectResponse(f"{settings.frontend_base_url}/dashboard/integrations?connected={provider}")
    except (service.InvalidOAuthStateError, service.OAuthNotConfiguredError, CrmApiError):
        return RedirectResponse(f"{settings.frontend_base_url}/dashboard/integrations?oauth_error={provider}")


@router.post("/webhooks/{provider}/{tenant_id}")
async def ingest_webhook(provider: str, tenant_id: UUID) -> None:
    """Kept as a stub (2026-07-24, client decision) rather than deleted --
    neither AmoCRM nor Bitrix24 has a webhook path at all anymore (see
    providers.py's module docstring, crm/worker.py's sync_amocrm_leads/
    sync_bitrix24_leads pull instead), so any hit here is either a stale
    provider-side webhook config nobody's cleaned up yet, or an external
    scanner -- a clean, explicit 410 is more diagnosable than a bare 404."""
    raise HTTPException(status.HTTP_410_GONE, "This CRM integration no longer uses webhooks -- leads are synced via periodic API pull")


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
    except service.OAuthNotConfiguredError:
        # Bug fix (2026-07-18, found via full-API-surface load test): this
        # was missing here even though every other push_customer_to_crm
        # caller (get_oauth_authorize_url/oauth_callback above) already
        # catches it -- a tenant with OAuth-based creds but no platform-
        # level client_id/secret configured got a raw unhandled 500 instead
        # of a clean 400, same as the sibling OAuth routes.
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{provider} OAuth is not configured yet")
    except CrmApiError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"CRM provider error: {exc.message}")


@router.get("/leads", response_model=list[CrmLeadSyncOut])
async def list_leads(pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(CRM_VIEW))):
    return await service.list_lead_syncs(pool, auth.tenant_id)


@router.get("/leads/stream")
async def stream_leads(
    request: Request,
    pool=Depends(get_pool),
    redis_client=Depends(get_redis),
    settings: Settings = Depends(get_settings),
    auth: AuthContext = Depends(require_permission(CRM_VIEW)),
):
    return StreamingResponse(
        _lead_sync_event_source(request, pool, redis_client, auth.tenant_id, settings), media_type="text/event-stream"
    )


@router.post("/manager-mappings", response_model=ManagerMappingOut, status_code=status.HTTP_201_CREATED)
async def create_manager_mapping(
    body: ManagerMappingCreate,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(CRM_MANAGE)),
):
    try:
        return await service.create_manager_mapping(
            pool, auth.tenant_id, body.provider, body.external_manager_id, body.user_id
        )
    except service.UserNotFoundError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "user_id does not exist in this tenant")


@router.get("/manager-candidates", response_model=list[ManagerCandidateOut])
async def list_manager_candidates(
    provider: str = Query(..., description="amocrm or bitrix24"),
    pool=Depends(get_pool),
    auth: AuthContext = Depends(get_current_user),
):
    """Self-service (no crm.manage needed, mirrors manager-mappings/me):
    lets any employee fetch the connected CRM's real user list to pick their
    own name from a dropdown instead of typing a raw external id by hand."""
    return await service.list_manager_candidates(pool, auth.tenant_id, provider)


@router.post("/manager-mappings/me", response_model=ManagerMappingOut, status_code=status.HTTP_201_CREATED)
async def create_own_manager_mapping(
    body: ManagerMappingSelfCreate,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(get_current_user),
):
    """Self-service: no crm.manage needed -- lets an employee link their own
    CRM manager identity on first login instead of requiring an admin to
    configure it for every employee (client requirement, 2026-07-11)."""
    return await service.create_own_manager_mapping(
        pool, auth.tenant_id, auth.user_id, body.provider, body.external_manager_id
    )


@router.get("/manager-mappings", response_model=list[ManagerMappingOut])
async def list_manager_mappings(pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(CRM_VIEW))):
    return await service.list_manager_mappings(pool, auth.tenant_id)


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
