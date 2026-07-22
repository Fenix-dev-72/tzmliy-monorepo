from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.core.deps import AuthContext, get_current_user, get_pool, require_permission
from app.modules.auth.permissions import CALLS_MANAGE, CALLS_VIEW, CALLS_VIEW_ALL
from app.modules.calls import service
from app.modules.calls.providers import UnknownProviderError
from app.modules.calls.schemas import (
    CallOut,
    IntegrationCredentialCreate,
    IntegrationCredentialOut,
    ManagerMappingCreate,
    ManagerMappingOut,
    ManagerMappingSelfCreate,
    MoiZvonkiConnectRequest,
    ProviderName,
    RecordingUrlOut,
    UtelConnectRequest,
    WebhookInfoOut,
)

router = APIRouter(prefix="/api/v1/calls", tags=["calls"])


@router.post("/webhooks/{provider}/{tenant_id}")
async def ingest_webhook(provider: str, tenant_id: UUID, request: Request, pool=Depends(get_pool)):
    raw_body = await request.body()
    try:
        return await service.ingest_webhook(
            pool, provider, tenant_id, raw_body, dict(request.headers), dict(request.query_params)
        )
    except UnknownProviderError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown call provider")
    except service.IntegrationNotConfiguredError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Integration not configured for this tenant")
    except service.InvalidSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid webhook signature")


@router.post("/integrations", response_model=IntegrationCredentialOut, status_code=status.HTTP_201_CREATED)
async def configure_integration(
    body: IntegrationCredentialCreate,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(CALLS_MANAGE)),
):
    return await service.configure_integration(pool, auth.tenant_id, body.provider, body.webhook_secret, body.api_key)


@router.get("/integrations", response_model=list[IntegrationCredentialOut])
async def list_integrations(pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(CALLS_VIEW))):
    return await service.list_integrations(pool, auth.tenant_id)


@router.delete("/integrations/{provider}", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect_integration(
    provider: ProviderName, pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(CALLS_MANAGE))
):
    await service.disconnect_integration(pool, auth.tenant_id, provider)


@router.post("/integrations/utel/connect", response_model=IntegrationCredentialOut, status_code=status.HTTP_201_CREATED)
async def connect_utel(
    body: UtelConnectRequest, pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(CALLS_MANAGE))
):
    """Real "1 tugma bilan ulash" for UTEL (2026-07-17, confirmed against
    UTEL's live OpenAPI spec) -- logs in with the tenant's own UTEL
    email+password and registers our webhook URL automatically via UTEL's
    own API, so the admin never has to open UTEL's dashboard at all."""
    try:
        return await service.quick_connect_utel(pool, auth.tenant_id, body.subdomain, body.email, body.password)
    except service.UtelLoginError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"UTEL bilan ulanishda xatolik: {exc}")


@router.post(
    "/integrations/moi-zvonki/connect", response_model=IntegrationCredentialOut, status_code=status.HTTP_201_CREATED
)
async def connect_moi_zvonki(
    body: MoiZvonkiConnectRequest, pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(CALLS_MANAGE))
):
    """Real "1 tugma bilan ulash" for "Мои звонки" (2026-07-17, confirmed
    against its live API docs) -- registers our webhook URL automatically
    via its webhook.subscribe API using the tenant's own account email +
    api_key (no login step needed, unlike UTEL), so the admin never has to
    open Мои звонки's own webhook UI at all."""
    try:
        return await service.quick_connect_moi_zvonki(pool, auth.tenant_id, body.domain, body.user_name, body.api_key)
    except service.MoiZvonkiConnectError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Мои звонки bilan ulanishda xatolik: {exc}")


@router.get("/integrations/{provider}/webhook-url", response_model=WebhookInfoOut)
async def get_webhook_url(
    # Security-audit fix (2026-07-18): this returns the decrypted
    # webhook_secret in plaintext (needed so an admin can re-paste it into
    # the provider's own webhook config) -- CALLS_VIEW (read-only, granted
    # much more broadly) let any read-only user exfiltrate a tenant's live
    # webhook secret. Gated by CALLS_MANAGE now, matching every other route
    # in this router that touches integration credentials.
    provider: ProviderName, pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(CALLS_MANAGE))
):
    try:
        webhook_url, webhook_secret = await service.get_webhook_info(pool, auth.tenant_id, provider)
    except service.IntegrationNotConfiguredError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Integration not configured for this tenant")
    return WebhookInfoOut(webhook_url=webhook_url, webhook_secret=webhook_secret)


@router.post("/manager-mappings", response_model=ManagerMappingOut, status_code=status.HTTP_201_CREATED)
async def create_manager_mapping(
    body: ManagerMappingCreate,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(CALLS_MANAGE)),
):
    try:
        return await service.create_manager_mapping(
            pool, auth.tenant_id, body.provider, body.external_agent_id, body.user_id
        )
    except service.UserNotFoundError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "user_id does not exist in this tenant")


@router.get("/manager-mappings", response_model=list[ManagerMappingOut])
async def list_manager_mappings(pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(CALLS_VIEW))):
    return await service.list_manager_mappings(pool, auth.tenant_id)


@router.post("/manager-mappings/me", response_model=ManagerMappingOut, status_code=status.HTTP_201_CREATED)
async def create_own_manager_mapping(
    body: ManagerMappingSelfCreate,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(get_current_user),
):
    """Self-service: no calls.manage needed, user_id is always the caller's
    own (never a body field) -- same split as attendance's check-in vs. the
    admin-only /push. Lets an employee link their own UTEL agent id on first
    login instead of requiring an admin to configure it for every employee."""
    return await service.create_own_manager_mapping(pool, auth.tenant_id, auth.user_id, body.provider, body.external_agent_id)


@router.get("/calls", response_model=list[CallOut])
async def list_calls(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(CALLS_VIEW)),
):
    can_view_all = CALLS_VIEW_ALL in auth.permissions
    return await service.list_calls(pool, auth.tenant_id, auth.user_id, can_view_all, limit, offset)


@router.get("/calls/{call_id}", response_model=CallOut)
async def get_call(call_id: UUID, pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(CALLS_VIEW))):
    can_view_all = CALLS_VIEW_ALL in auth.permissions
    try:
        return await service.get_call(pool, auth.tenant_id, call_id, auth.user_id, can_view_all)
    except service.CallNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Call not found")


@router.get("/calls/{call_id}/recording", response_model=RecordingUrlOut)
async def get_recording_url(
    call_id: UUID, pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(CALLS_VIEW))
):
    can_view_all = CALLS_VIEW_ALL in auth.permissions
    try:
        url = await service.get_recording_url(pool, auth.tenant_id, call_id, auth.user_id, can_view_all)
    except service.CallNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Call not found")
    except service.RecordingNotAvailableError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No recording available for this call")
    return {"url": url}
